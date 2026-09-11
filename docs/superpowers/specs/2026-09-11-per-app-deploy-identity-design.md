# Per-App Deploy Identity Design

Date: 2026-09-11
Status: Approved direction (user chose this option); detailed decisions below were made by the implementer and are recorded for review.

## Problem

Portal-managed publishing gives every published app a GitHub OIDC federated identity credential (FIC) on one shared Entra application, the publisher identity configured by `AZURE_PUBLISH_CLIENT_ID`. Microsoft caps an application or user-assigned managed identity at 20 FICs and does not raise the limit, so the portal cannot publish more than 20 apps.

The shared identity also has a security problem. It is the same service principal the portal runtime uses (Contributor on the publish resource group), and every managed repository exchanges its GitHub token for it. Any repository owner who edits the `AZURE_WEBAPP_NAME` in their workflow can deploy into another app's Web App with the portal's own permissions.

## Goal

Remove the 20-credential ceiling and give each published app a deploy identity that can only deploy to its own Web App, without changing the generated GitHub workflow.

## Non-goals

- Changing the deploy workflow template, the GitHub Actions secret names, or the `azure/login` + `azure/webapps-deploy` steps.
- Automatically deleting the old FICs on the shared publisher application. That is a one-time operator cleanup, documented below.
- Flexible (wildcard) federated credentials.

## Design

### Resource model

Each published app gets one **user-assigned managed identity (UAMI)** in the publish resource group, alongside its Web App, database, and Key Vault.

| Resource | Name | Tags |
| --- | --- | --- |
| User-assigned managed identity | `id-<slug>-<shortRequestId>` (max 128 chars) | Same portal tags as the Web App (`managedBy=cu-app-portal`, `appRequestId`, `supportReference`, ...) |
| Federated identity credential on that UAMI | `github-<slug>-<shortRequestId>` (existing `federatedCredentialName`) | n/a (sub-resource) |
| Role assignment | Website Contributor (`de139f84-1756-47ae-9be6-808fbbe84772`) for the UAMI principal, scoped to the app's Web App resource | n/a |

The FIC keeps today's shape: issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`, subject from `buildGitHubFederatedCredentialSubject` (name-based or immutable, per repository).

The GitHub Actions secret `AZURE_CLIENT_ID` becomes the UAMI's client ID. `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, and `AZURE_WEBAPP_NAME` are unchanged. The workflow template does not change: `azure/login@v2` with a UAMI client ID and a federated token is a supported pattern, and Website Contributor at the Web App scope covers `Microsoft.Web/sites/*`, which is what `azure/webapps-deploy@v3` needs.

### Persistence

Two nullable columns are added to `AppRequest`:

- `azureManagedIdentityName` (String?)
- `azureManagedIdentityClientId` (String?)

They are written after provisioning and repair, shown to operators, and used by scoped Azure deletion. Names are still derivable from `buildPublishTargetNames`, matching how `azureWebAppName` is handled today.

### ARM client additions (`src/features/publishing/azure/arm-client.ts`)

All calls use `Microsoft.ManagedIdentity` api-version `2023-01-31`.

- `userAssignedIdentityId(resourceGroup, name)` and `webAppId(resourceGroup, name)` resource-id helpers.
- `putUserAssignedIdentity({ resourceGroup, name, location, tags })` → `{ clientId, principalId }`. PUT is idempotent.
- `getUserAssignedIdentity({ resourceGroup, name })` → `{ exists: false } | { exists: true, clientId, principalId }` (404 → not found).
- `deleteUserAssignedIdentity({ resourceGroup, name })` accepting 200/202/204/404.
- `listFederatedIdentityCredentials({ resourceGroup, identityName })` → `Array<{ name, issuer, subject, audiences }>`.
- `ensureFederatedIdentityCredential({ resourceGroup, identityName, name, subject })`:
  1. List credentials on the identity.
  2. Delete any credential whose name is not `name` (the identity is portal-owned; anything else is stale or foreign).
  3. If `name` exists with the expected issuer, subject, and audience, return.
  4. Otherwise PUT `name` with the expected properties. Retry a 409 (concurrent write on the same identity) a few times with short delays.
- `putRoleAssignment` gains a retry for `400 PrincipalNotFound`, which happens when a brand-new UAMI principal has not replicated yet. `principalType: "ServicePrincipal"` stays set, which already reduces this.
- New exported constant `WEBSITE_CONTRIBUTOR_ROLE_DEFINITION_ID`.

### Microsoft Graph client

The FIC functions on `graph-client.ts` (`listFederatedCredentials`, `deleteFederatedCredential`, `replaceFederatedCredential`, `ensureFederatedCredential`) are removed. Graph is used only for redirect URIs on the shared generated-app registration.

### Publish flow (`azure/runtime.ts`)

`provisionInfrastructure`, after `putWebApp` and before app settings:

1. `putUserAssignedIdentity` with the app's tags.
2. `putRoleAssignment` of Website Contributor for the UAMI principal at the Web App resource scope.
3. Return `azureManagedIdentityName` and `azureManagedIdentityClientId` in `ProvisionedPublishTarget` so `runPublishAttempt` persists them with the other Azure fields.

`deployRepository`, step `github_federated_credential`:

1. Read the repository OIDC identity (unchanged).
2. `arm.ensureFederatedIdentityCredential` on the app's UAMI.
3. Read the UAMI client ID (`getUserAssignedIdentity`; fail with a clear error if missing, which points the user to Repair Publishing Setup).

Step `github_actions_secrets` writes `AZURE_CLIENT_ID` = UAMI client ID.

### Preflight and repair (`setup/service.ts`)

Check `github_federated_credential`:

- UAMI missing → `FAIL` (repairable) "Deployment identity is missing."
- UAMI present, no credential with the expected subject → `FAIL` (repairable) "GitHub OIDC federated credential is missing or stale."
- Otherwise `PASS`. Metadata includes `managedIdentityName`, `credentialName`, `subject`.

Repair, in order, reusing the existing step markers:

1. `azure_resource_access`: database, Web App, then `putUserAssignedIdentity` and the Website Contributor role assignment.
2. `azure_app_settings`, `entra_redirect_uri`: unchanged.
3. `github_federated_credential`: `ensureFederatedIdentityCredential` on the UAMI.
4. `github_actions_secrets`: delete and re-set the four secrets, `AZURE_CLIENT_ID` = UAMI client ID.
5. Persist `azureManagedIdentityName` and `azureManagedIdentityClientId` with the other Azure fields.

Because preflight fails for any app whose UAMI does not exist yet, every pre-existing published app reports `NEEDS_REPAIR` after this change ships, and one Repair Publishing Setup moves it to the new model. Push-to-deploy keeps working in the meantime because the old FIC on the shared application is untouched until an operator removes it.

### Error classification (`setup/status.ts`)

- An `Azure ARM request failed: 403` during setup is now classified `BLOCKED` with summary "Azure permission is missing for publishing setup." and operator detail naming the role-assignment and managed-identity permissions. Today it falls through to a generic `NEEDS_REPAIR`, which sends users to a repair that cannot succeed.
- The Graph permission detail text no longer mentions federated credentials on the publisher application.

### Deletion (`app-deletion/external.ts`)

`DeleteAzureDeploymentInput` gains `managedIdentityName`. Scoped Azure deletion deletes the UAMI after the Web App, database, and Key Vault. Deleting the Web App removes the role assignment at that scope; deleting the identity removes the principal and its credential.

### Configuration

`AZURE_PUBLISH_CLIENT_ID` is no longer read by code and is removed from the config schema, `.env.example`, and the config tests. The portal authenticates through `DefaultAzureCredential` as before. Setup docs refer to "the portal runtime identity" and use a plain shell variable for its client ID in `az` examples.

### Required Azure permissions for the portal runtime identity

On the publish resource group:

- **Contributor** (already held) covers creating and deleting user-assigned identities and their federated credentials.
- **Role Based Access Control Administrator** (already held, ABAC-constrained) must additionally allow assigning **Website Contributor** (`de139f84-1756-47ae-9be6-808fbbe84772`). The ABAC condition's `GuidEquals` list grows from one GUID to two. Documented in `docs/portal/setup.md` and `docs/portal/technical-operations.md`.

No Graph permission changes. The `Application.ReadWrite.OwnedBy` style permission used for FICs on the publisher application can be narrowed by an operator later; that is out of scope.

### Generated deployment manifest

`perApp` gains `managedIdentityNamePattern: "id-<slug>-<short-request-id>"` so the contract file in generated repositories describes the real model.

### Documentation

- `docs/portal/setup.md`: per-app deploy identity, updated role list and ABAC condition, removal of `AZURE_PUBLISH_CLIENT_ID`.
- `docs/portal/technical-operations.md`: resource model row for identities, naming prefix `id-`, permissions, triage text, and a **migration procedure** for existing apps: run Repair Publishing Setup for each published app, confirm a deploy, then remove the `github-*` credentials from the shared publisher application in Entra.
- Template publishing doc mentions the per-app identity.

## Testing

Unit tests (vitest) cover:

- ARM client: PUT/GET/DELETE identity, list/ensure FIC (stale credential deleted, matching credential left alone, 409 retry), role assignment `PrincipalNotFound` retry.
- Naming: `managedIdentityName` shape and length.
- Runtime: provisioning creates the identity and role assignment and returns the new fields; deploy ensures the FIC on the identity and writes the UAMI client ID secret.
- Setup service: preflight fails when the identity is missing, passes with a matching credential; repair creates identity, role, credential, and secrets and persists the new fields.
- Status: ARM 403 → BLOCKED.
- Deletion: identity deleted when present, skipped when null.
- Graph client: FIC tests removed.

Repo gates: `npm test` (vitest) and `npm run build`.

## Rollout notes

1. Before deploying, an operator updates the RBAC Administrator ABAC condition to include Website Contributor. Without it, provisioning fails at the role assignment with a 403 and the app shows `BLOCKED` with the new Azure permission message.
2. Deploy the portal; the migration adds the two columns at startup.
3. Repair each existing published app, then remove its credential from the shared publisher application.
