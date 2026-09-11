# Per-App Deploy Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every portal-published app its own user-assigned managed identity (UAMI) that holds the app's GitHub OIDC federated credential and can deploy only to that app's Web App, replacing the shared publisher application that is capped at 20 credentials.

**Architecture:** Provisioning creates a UAMI next to the Web App and assigns it Website Contributor scoped to that Web App. The GitHub credential moves from Microsoft Graph (shared app registration) to ARM (the UAMI's `federatedIdentityCredentials` sub-resource). The `AZURE_CLIENT_ID` repository secret becomes the UAMI client ID. Preflight, repair, and scoped deletion learn about the identity; two nullable columns record its name and client ID.

**Tech Stack:** Next.js / TypeScript, Prisma (PostgreSQL), vitest, Azure Resource Manager REST (`Microsoft.ManagedIdentity` api-version `2023-01-31`, `Microsoft.Authorization` `2022-04-01`), Microsoft Graph (redirect URIs only).

Spec: `docs/superpowers/specs/2026-09-11-per-app-deploy-identity-design.md`

## Global Constraints

- Managed identity name: `id-<slug>-<shortRequestId>`, max 128 chars, built with the existing `buildNameWithSuffix` helper.
- Federated credential name is unchanged: `github-<slug>-<shortRequestId>` (`federatedCredentialName`).
- Website Contributor role definition ID: `de139f84-1756-47ae-9be6-808fbbe84772`.
- Federated credential issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`.
- The generated workflow template and the four secret names (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_WEBAPP_NAME`) do not change.
- Repo gates: `npx vitest run` and `npm run build`. `tsc` has ~258 pre-existing test-file errors; compare against baseline, do not chase them.
- Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File map

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | add `azureManagedIdentityName String?`, `azureManagedIdentityClientId String?` to `AppRequest` |
| `prisma/migrations/20260911120000_add_app_managed_identity/migration.sql` | new |
| `src/features/publishing/azure/naming.ts` (+test) | add `managedIdentityName` |
| `src/features/publishing/azure/arm-client.ts` (+test) | UAMI CRUD, FIC list/ensure, `PrincipalNotFound` retry, `webAppId`, `userAssignedIdentityId`, `WEBSITE_CONTRIBUTOR_ROLE_DEFINITION_ID` |
| `src/features/publishing/azure/graph-client.ts` (+test) | remove FIC functions |
| `src/features/publishing/azure/config.ts` (+test) | drop `AZURE_PUBLISH_CLIENT_ID` |
| `src/features/publishing/azure/runtime.ts` (+test) | provision UAMI + role; deploy ensures FIC on UAMI; UAMI client ID secret |
| `src/features/publishing/run-publish-attempt.ts` | `ProvisionedPublishTarget` gains two fields (persisted automatically) |
| `src/features/publishing/setup/service.ts` (+test) | preflight and repair use the UAMI |
| `src/features/publishing/setup/status.ts` (+test) | ARM 403 → BLOCKED; Graph text |
| `src/features/app-deletion/external.ts` (+test), `actions.ts` | delete UAMI |
| `src/features/generation/deployment-manifest.ts` (+test) | `managedIdentityNamePattern` |
| `.env.example`, `docs/portal/setup.md`, `docs/portal/technical-operations.md`, `templates/web-app/files/docs/publishing/azure-app-service.md.template` | docs |

---

### Task 1: Naming and schema

**Files:**
- Modify: `src/features/publishing/azure/naming.ts`, `src/features/publishing/azure/naming.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260911120000_add_app_managed_identity/migration.sql`

**Produces:** `buildPublishTargetNames(...).managedIdentityName: string`; Prisma fields `azureManagedIdentityName`, `azureManagedIdentityClientId`.

- [ ] Add to `naming.test.ts` (inside the existing `toEqual` block and as a shape test): `managedIdentityName: "id-campus-dashboard-clx9abc1"`, `managedIdentityName.length <= 128`, matches `/^id-[a-z0-9][a-z0-9-]*[a-z0-9]$/`.
- [ ] Run `npx vitest run src/features/publishing/azure/naming.test.ts` → FAIL.
- [ ] Implement `managedIdentityName = buildNameWithSuffix({ prefix: "id-", slug, suffix: shortRequestId, maxLength: 128 })` and add to the type and return.
- [ ] Add the two Prisma columns after `azureKeyVaultUri`; write the migration:
  ```sql
  -- AlterTable
  ALTER TABLE "AppRequest" ADD COLUMN     "azureManagedIdentityName" TEXT,
  ADD COLUMN     "azureManagedIdentityClientId" TEXT;
  ```
- [ ] `npx prisma generate`; run naming tests → PASS. Commit `feat: name per-app deploy identity and add schema fields`.

### Task 2: ARM client additions

**Files:** `src/features/publishing/azure/arm-client.ts`, `arm-client.test.ts`

**Produces:**
```ts
export const WEBSITE_CONTRIBUTOR_ROLE_DEFINITION_ID = "de139f84-1756-47ae-9be6-808fbbe84772";
webAppId(resourceGroup, name): string
userAssignedIdentityId(resourceGroup, name): string
putUserAssignedIdentity({ resourceGroup, name, location, tags }): Promise<{ clientId: string; principalId: string }>
getUserAssignedIdentity({ resourceGroup, name }): Promise<{ exists: false } | { exists: true; clientId: string; principalId: string }>
deleteUserAssignedIdentity({ resourceGroup, name }): Promise<void>            // 200/202/204/404 ok
listFederatedIdentityCredentials({ resourceGroup, identityName }): Promise<Array<{ name: string; issuer: string; subject: string; audiences: string[] }>>
ensureFederatedIdentityCredential({ resourceGroup, identityName, name, subject }): Promise<void>
```
`createAzureArmClient` gains optional `sleepImpl?: (ms) => Promise<void>` for retry tests.

Tests to write first:
- PUT identity hits `/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-campus-dashboard-clx9abc1?api-version=2023-01-31` with `{ location, tags }` and returns `clientId`/`principalId` from `properties`.
- GET identity returns `{ exists: false }` on 404 and the ids on 200.
- DELETE identity tolerates 404.
- `listFederatedIdentityCredentials` maps `value[].name` and `value[].properties`.
- `ensureFederatedIdentityCredential`: (a) matching credential present → no PUT/DELETE; (b) same name, different subject → PUT with new subject; (c) foreign name → DELETE it, then PUT ours; (d) first PUT 409 → sleep then retry succeeds.
- `putRoleAssignment` 400 `PrincipalNotFound` → retries after sleep and succeeds; `WEBSITE_CONTRIBUTOR_ROLE_DEFINITION_ID` exported.

Commit `feat: manage user-assigned identities and federated credentials via ARM`.

### Task 3: Graph client trim, config, status classification

**Files:** `graph-client.ts` (+test), `config.ts` (+test), `setup/status.ts` (+test)

- [ ] Remove FIC functions and their tests from the Graph client; keep `hasRedirectUri`, `ensureRedirectUri`.
- [ ] Remove `AZURE_PUBLISH_CLIENT_ID` / `azureClientId` from config schema, type, and tests.
- [ ] `status.ts`: add `AZURE_PERMISSION_SUMMARY = "Azure permission is missing for publishing setup."` and `AZURE_PERMISSION_DETAIL = "Grant the portal runtime identity Contributor and the constrained Role Based Access Control Administrator role (allowing Key Vault Secrets User and Website Contributor) on the publish resource group, then run Repair Publishing Setup."`. Classify `message.includes("Azure ARM request failed: 403")` → `BLOCKED`. Update `GRAPH_PERMISSION_DETAIL` to "Grant the portal runtime identity permission to update the shared app registration redirect URIs, then run Repair Publishing Setup." Test: ARM 403 → BLOCKED with the new summary.
- [ ] Commit `refactor: drop shared publisher credential plumbing`.

### Task 4: Publish runtime

**Files:** `azure/runtime.ts`, `runtime.test.ts`, `run-publish-attempt.ts`

- [ ] `ProvisionedPublishTarget` gains `azureManagedIdentityName: string; azureManagedIdentityClientId: string;`.
- [ ] `RuntimeDeps.arm` gains `webAppId`, `putUserAssignedIdentity`, `getUserAssignedIdentity`, `ensureFederatedIdentityCredential`; `RuntimeDeps.graph` loses `ensureFederatedCredential`.
- [ ] `provisionInfrastructure`: after `putWebApp`, call `putUserAssignedIdentity({ resourceGroup, name: names.managedIdentityName, location, tags })`, then `putRoleAssignment({ scope: arm.webAppId(resourceGroup, names.webAppName), roleDefinitionId: WEBSITE_CONTRIBUTOR_ROLE_DEFINITION_ID, principalId })`. Each preceded by `authorizeProviderMutation`. Return the two new fields.
- [ ] `deployRepository`: under `github_federated_credential`, call `arm.ensureFederatedIdentityCredential({ resourceGroup, identityName: names.managedIdentityName, name: names.federatedCredentialName, subject })`, then `getUserAssignedIdentity`; if `!exists` throw `Error("Deployment identity <name> is missing. Run Repair Publishing Setup.")`. Secret `AZURE_CLIENT_ID` = `clientId`.
- [ ] Tests: provisioning creates the identity with tags and the Website Contributor assignment at the web app scope, returns new fields; deploy calls `ensureFederatedIdentityCredential` with the expected subject and writes the UAMI client ID; deploy fails clearly when the identity is missing; ordering test updated (FIC ensure before secrets).
- [ ] Commit `feat: provision a per-app deploy identity during publish`.

### Task 5: Preflight and repair

**Files:** `setup/service.ts`, `service.test.ts`

- [ ] `PublishingSetupServiceDeps.arm` gains `webAppId`, `putUserAssignedIdentity`, `getUserAssignedIdentity`, `listFederatedIdentityCredentials`, `ensureFederatedIdentityCredential`, `putRoleAssignment`; `graph` loses `listFederatedCredentials`, `replaceFederatedCredential`.
- [ ] `buildSecretValues(config, webAppName, clientId)`.
- [ ] Preflight check (replace Graph block):
  ```ts
  const identity = await deps.arm.getUserAssignedIdentity({ resourceGroup, name: names.managedIdentityName });
  if (!identity.exists) fail("github_federated_credential", "Deployment identity is missing.", { managedIdentityName, credentialName, subject: expectedSubject, repairable: true })
  else { const creds = await deps.arm.listFederatedIdentityCredentials({ resourceGroup, identityName }); match on subject → pass / fail "GitHub OIDC federated credential is missing or stale." }
  ```
- [ ] Repair: after `putWebApp` (still `azure_resource_access`): `putUserAssignedIdentity` → `putRoleAssignment` (Website Contributor at `webAppId`). Under `github_federated_credential`: `ensureFederatedIdentityCredential`. Secrets use the identity's `clientId`. Persist `azureManagedIdentityName`, `azureManagedIdentityClientId`.
- [ ] Tests: preflight fails when identity missing / credential stale, passes when matching; repair creates identity + role + credential and writes the client ID secret; persisted data includes the two fields; existing ordering/idempotency assertions updated.
- [ ] Commit `feat: check and repair the per-app deploy identity`.

### Task 6: Deletion, manifest, UI

**Files:** `app-deletion/external.ts` (+test), `app-deletion/actions.ts`, `generation/deployment-manifest.ts` (+test), `src/app/download/[requestId]/page.tsx`

- [ ] `DeleteAzureDeploymentInput.managedIdentityName?: string | null`; deps gain `deleteUserAssignedIdentity`; delete after Key Vault. Actions pass `appRequest.azureManagedIdentityName` and null the two columns where `azureKeyVaultName: null` is set. Tests: deleted when present, skipped when null.
- [ ] Manifest: `managedIdentityNamePattern: \`id-${appSlug}-<short-request-id>\`` in type and output; update both test expectations.
- [ ] UI label `github_federated_credential: "GitHub publish identity"`.
- [ ] Commit `feat: delete the deploy identity with scoped Azure deletion`.

### Task 7: Docs and env

**Files:** `.env.example`, `docs/portal/setup.md`, `docs/portal/technical-operations.md`, `templates/web-app/files/docs/publishing/azure-app-service.md.template`

- [ ] Remove `AZURE_PUBLISH_CLIENT_ID` from `.env.example` and the setup variable list.
- [ ] Setup: explain the per-app identity; role list for the portal runtime identity; ABAC condition with both GUIDs `{4633458b-17de-408a-b874-0445c86b69e6, de139f84-1756-47ae-9be6-808fbbe84772}`; use `$PORTAL_RUNTIME_CLIENT_ID` in `az` examples.
- [ ] Technical operations: resource model row, naming prefix `id-`, permissions, GitHub OIDC section, triage text, and a "Migrating apps published before per-app identities" procedure.
- [ ] Template doc: per-app identity sentence in Resource Model.
- [ ] Commit `docs: describe per-app deploy identities and the migration procedure`.

### Task 8: Verification

- [ ] `npx vitest run` → all green.
- [ ] `npm run build` → success.
- [ ] `npx tsc --noEmit -p . 2>&1 | grep -v "\.test\." | head` → no new non-test errors.
- [ ] Review `git diff main --stat`; final commit if anything is outstanding.
