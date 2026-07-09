# App Environment Variables and Secrets Design

Date: 2026-07-08
Status: Approved

## Summary

Let app owners and collaborators add, overwrite, and delete environment variables for their apps from the app details screen. Non-secret values are stored as plain Azure App Service application settings. Secret values are stored in a per-app Azure Key Vault and surfaced to the running app through Key Vault references, so secret values never sit readable in site config and never touch the portal database.

## Decisions

These were confirmed during brainstorming:

1. **Secret storage:** Azure Key Vault plus Key Vault references in app settings. Non-secrets are plain app settings.
2. **UX surface:** a new "Environment Variables" section on the existing app details screen (`/download/[requestId]`). No agent flow in this phase.
3. **Apply timing:** changes apply to the live Azure app immediately on save. The portal database is the source of truth for which variables exist; publish merges them, so a republish never wipes user variables.
4. **Permissions:** the app owner and collaborators (existing `AppAccess` model, plus admins) can manage variables. Secret values are write-only after save: they can be overwritten or deleted, never viewed.
5. **Vault layout:** one Key Vault per app, not a shared vault. Vault-scoped RBAC means apps can never read each other's secrets, and vault lifecycle matches app lifecycle.

## Data Model

New Prisma model:

```prisma
model AppEnvironmentVariable {
  id           String     @id @default(cuid())
  appRequestId String
  key          String
  isSecret     Boolean
  value        String?    // populated only when isSecret is false
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  appRequest   AppRequest @relation(fields: [appRequestId], references: [id], onDelete: Cascade)

  @@unique([appRequestId, key])
}
```

Rules:

- `value` is null whenever `isSecret` is true. Secret values live only in Key Vault.
- The portal DB is the source of truth for which variables exist and whether each is a secret. Key Vault is the source of truth for secret values.

New nullable fields on `AppRequest`:

- `azureKeyVaultName String?`
- `azureKeyVaultUri String?`

## Naming

`buildPublishTargetNames` in `src/features/publishing/azure/naming.ts` gains a `keyVaultName`:

- Pattern: `kv-{slug}-{shortRequestId}` built with the existing `buildNameWithSuffix` helper, `maxLength: 24` (the Key Vault limit).
- Key Vault names must start with a letter, contain only alphanumerics and hyphens, and have no consecutive hyphens; the existing slug rules plus the `kv-` prefix satisfy this.

Vault secret names: Key Vault forbids underscores, so env keys map to secret names by replacing `_` with `-` (e.g. `API_KEY` → `API-KEY`). To keep this mapping collision-free, key uniqueness within an app is enforced case-insensitively with `_` and `-` treated as equivalent.

## Validation and Reserved Keys

- Key format: `^[A-Za-z_][A-Za-z0-9_]*$`, max 128 chars.
- Value max length: 4096 chars. Empty values allowed for non-secrets, not for secrets.
- Reserved keys are rejected (exact, case-insensitive): `DATABASE_URL`, `AUTH_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER`, `NODE_ENV`, `PORT`.
- Reserved prefixes are rejected (case-insensitive): `WEBSITE_`, `SCM_`, `ENABLE_ORYX`.

## Azure Integration

All additions extend the existing hand-rolled clients in `src/features/publishing/azure/`.

### ARM client (`arm-client.ts`)

- `putKeyVault` — creates/updates `Microsoft.KeyVault/vaults` with `enableRbacAuthorization: true`, standard SKU, portal ownership tags. Soft delete stays at the Azure default (enabled, 90 days); the portal never purges.
- `deleteKeyVault` — deletes the vault (soft delete), tolerant of 404.
- `putRoleAssignment` — creates `Microsoft.Authorization/roleAssignments` granting a principal a role at vault scope. The assignment name is a deterministic UUID derived from scope + role + principal so re-publish is idempotent (ARM treats an existing identical assignment as success; 409 with `RoleAssignmentExists` is treated as success).
- `putWebApp` — gains `identity: { type: "SystemAssigned" }` in the PUT body and returns `identity.principalId` from the response.

### Key Vault data-plane client (new `key-vault-client.ts`)

Same shape as the ARM client: `tokenProvider` (scope `https://vault.azure.net/.default`) plus `fetchImpl`, talking to `https://{vaultName}.vault.azure.net`:

- `setSecret(name, value)` — `PUT /secrets/{name}?api-version=7.4`
- `deleteSecret(name)` — `DELETE /secrets/{name}?api-version=7.4`, tolerant of 404.

### Key Vault references

A secret variable becomes an app setting of the form:

```
@Microsoft.KeyVault(SecretUri=https://{vaultName}.vault.azure.net/secrets/{secretName})
```

The running app reads it as an ordinary env var. Resolution requires the web app's system-assigned managed identity to hold **Key Vault Secrets User** on the vault, which publish sets up.

## Flows

### Save (add or overwrite) a variable

Server action in new `src/features/env-vars/` module:

1. Resolve current user; authorize with the existing `appAccessWhere` (owner, collaborator, or admin).
2. Validate key and value (format, reserved keys, secret rules above).
3. If secret: ensure the vault exists (create lazily via `putKeyVault` and persist `azureKeyVaultName`/`azureKeyVaultUri` — a vault can exist before the web app, so secrets can be staged pre-publish), then `setSecret`.
4. If the app is published (`azureWebAppName` set): `getAppSettings` → overlay the new key (literal value or Key Vault reference) → `putAppSettings`. The read-merge-write preserves portal-reserved settings. App Service restarts the site automatically.
5. Persist the `AppEnvironmentVariable` row only after all Azure calls succeed; on Azure failure the action returns an inline error and nothing is saved.
6. Record audit event `ENV_VAR_SET` with `{ requestId, key, isSecret }` — never values.
7. Revalidate `/download/[requestId]`.

Changing a variable between secret and non-secret is done by delete + re-add (the UI's overwrite keeps the original `isSecret`).

### Delete a variable

1. Authorize and load the row.
2. If published: `getAppSettings` → remove the key → `putAppSettings`.
3. If secret: `deleteSecret` (404 tolerated).
4. Delete the DB row; record `ENV_VAR_DELETED` with `{ requestId, key, isSecret }`; revalidate.

### Publish (`provisionInfrastructure` in `runtime.ts`)

1. Load the app's `AppEnvironmentVariable` rows.
2. If any secrets exist: ensure vault (`putKeyVault`, idempotent) and persist vault fields if newly created.
3. `putWebApp` with system-assigned identity; capture `principalId`.
4. If a vault exists: `putRoleAssignment` granting the web app's `principalId` **Key Vault Secrets User** at vault scope.
5. Build settings = existing portal-reserved settings + user variables (literal values for non-secrets, Key Vault references for secrets). User variables can never shadow reserved keys because reserved keys are rejected at save time; reserved settings are applied last regardless.
6. `putAppSettings` as today.

### App deletion

The existing app-deletion flow additionally calls `deleteKeyVault` when `azureKeyVaultName` is set (soft delete gives 90-day recovery). `AppEnvironmentVariable` rows go away via `onDelete: Cascade`.

## UI

New "Environment Variables" card on `/download/[requestId]`, after the Azure Publishing section, following `docs/portal/ui-rules.md` and the existing card/section markup:

- Table of variables: key, value (secrets render as `••••••••` with a "secret" badge), last-updated timestamp.
- Add form: key input, value input, "store as a secret" checkbox, save button.
- Per-row delete control with an inline, section-scoped error on failure (same form/error patterns used elsewhere on the page). Overwriting a variable's value is done by saving an existing name in the add form.
- Copy explaining: saves apply to the live app within seconds and briefly restart it; secret values cannot be viewed again after saving; variables added before first publish are applied when the app is published.
- Section renders for apps with an Azure deployment target; hidden otherwise.

## Error Handling

- Azure failures surface as inline section errors (same pattern as publish errors) and abort before the DB write, so portal state never claims a variable that Azure rejected.
- Validation errors render inline next to the form fields.
- `getAppSettings` returning `exists: false` for a published app is treated as an error (the site should exist).

## Portal Azure Permissions (operational prerequisite)

The portal's publishing identity (the service principal behind `DefaultAzureCredential`, `AZURE_PUBLISH_CLIENT_ID`) needs, scoped to the publish resource group (`rg-cu-apps-published`):

1. **Contributor** (already held today for web app / postgres provisioning) — also covers creating and deleting Key Vaults and enabling web app managed identities. Control plane only; it does not grant secret read/write on RBAC vaults.
2. **Key Vault Secrets Officer** (new) — data-plane set/delete of secrets in the RBAC-mode vaults.
3. **Role Based Access Control Administrator** (new), constrained with an ABAC condition so it can only assign/remove the **Key Vault Secrets User** role (definition ID `4633458b-17de-408a-b874-0445c86b69e6`) — needed to grant each web app's managed identity read access to its own vault. (Owner or User Access Administrator also works but is much broader.)

Grant commands and the ABAC condition go in `docs/portal/setup.md` as part of implementation.

## Testing

Mirrors the repo's existing style:

- `arm-client.test.ts` additions and new `key-vault-client.test.ts` — fetch-mock tests for request shape, status handling, 404/409 tolerance.
- `naming.test.ts` — vault name pattern, 24-char cap, secret-name mapping and equivalence rules.
- New validation unit tests — key format, reserved keys/prefixes, secret value rules.
- `runtime.test.ts` additions — publish merges user vars, creates vault/role assignment only when secrets exist, reserved settings win.
- Env-var action tests — authz (owner/collaborator/admin/stranger), Azure-first ordering (no DB write on Azure failure), audit events without values.
- Page test — section renders variables, masks secrets, hides for non-Azure apps.

Gate: `npm test` and `npm run build`.

## Out of Scope

- Agent/conversational management of env vars (possible later layer over the same actions).
- Viewing secret values after save, secret rotation reminders, or vault purge.
- Per-variable permissions beyond the existing app access model.
- Shared/team-level variables across apps.
