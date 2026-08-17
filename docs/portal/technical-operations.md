# Portal Technical Operations and Support Guide

This is the administrative and support runbook for the Cedarville App Portal. It is for Tier 1 service desk staff, Tier 2 application administrators, and engineers maintaining the portal. It is not end-user documentation.

## Service Overview

The portal is a Next.js 15 application running on Node.js 24. It uses PostgreSQL through Prisma, authenticates Cedarville users through Microsoft Entra ID, and uses a GitHub App to create and manage repositories. It can also prepare and publish supported generated or imported apps to Azure App Service.

The portal has two separate Azure concerns. Keep them separate when troubleshooting:

| Concern | What it hosts | Primary owner | Key configuration |
| --- | --- | --- | --- |
| Portal self-hosting | This portal, its database, and sign-in flow | Portal operations | `app-portal/deployment-manifest.json`, Azure App Service settings, `.github/workflows/deploy-azure-app-service.yml` |
| Portal-managed publishing | Web Apps, PostgreSQL databases, Key Vaults, GitHub Actions setup for apps created or imported through the portal | Portal publishing administrators | `AZURE_PUBLISH_*`, GitHub App configuration, per-app publishing setup checks |

The portal is the supported control plane. A managed GitHub repository is the canonical source of application code. The portal does not retain generated source archives.

## Roles and Support Boundaries

### Tier 1: service desk

Tier 1 may confirm the user's identity, check whether they have access to the portal and the affected app, collect the support reference, confirm the visible status, and direct the user to safe self-service actions such as retrying a publish or accepting a collaboration invitation.

Tier 1 must not change Azure resources, GitHub App credentials, Entra configuration, database records, GitHub Actions secrets, or ownership/collaborator assignments without the approved administrative process.

For every escalation, capture:

- User email and whether they are the app owner, a collaborator, or a portal administrator.
- App name, portal app URL, support reference, repository URL, and Azure publish URL if shown.
- Exact user-visible message, time (including time zone), and the action attempted.
- Screenshot or copy of the relevant GitHub Actions run URL when publishing is involved.
- Whether the issue affects one app, one user, or all portal users.

### Tier 2: portal administrator

Tier 2 manages portal users and app records through `/admin`, verifies the production configuration, runs publishing repair, inspects provider state, and performs documented resource recovery. Tier 2 should use the portal UI first; it preserves audit context and enforces ownership safeguards.

Use direct Azure, GitHub, Entra, or database administration only when the portal is unavailable, a repair is blocked, or the portal record has already been deleted. Record the support reference and all manual changes in the incident record and, when relevant, in `docs/publishing/lessons-learned.md`.

### Engineering escalation

Escalate to engineering for recurring failures, unexpected database or audit data, security concerns, new template/runtime compatibility issues, failed migrations, a failed production deployment, or any requested code change. Preserve logs and provider request IDs before retrying destructive or credential-rotation actions.

## Access Model

- Only `@cedarville.edu` users may sign in. Authentication is a 24-hour JWT session.
- A newly signed-in user is synchronized into the local `User` table from Entra.
- `PORTAL_INITIAL_ADMIN_EMAILS` bootstraps the first portal administrator. After an administrator exists, manage roles in `/admin`.
- Each app has one primary owner. App owners and portal administrators can manage collaborators and scoped deletion.
- Collaborators can view app details, request GitHub access, repair publishing setup, and publish; they cannot delete resources or reassign ownership.
- A collaboration invitation grants portal access after acceptance. It does not automatically grant GitHub repository access.

If a person can sign in but cannot see an app, confirm ownership/collaboration through the portal's administrative UI before treating it as an authentication failure.

## Configuration Inventory

Keep production values in Azure App Service application settings or the approved secret store. Never put live secrets in Git, documentation, tests, templates, or `.env.example`.

| Area | Required variables | Purpose / common failure mode |
| --- | --- | --- |
| Core portal | `DATABASE_URL`, `AUTH_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Startup, database, and Entra sign-in. Invalid or missing values cause startup/auth failures. |
| Initial administration | `PORTAL_INITIAL_ADMIN_EMAILS` | One-time bootstrap for the first administrator. It is not the routine role-management mechanism. |
| Notifications | `PORTAL_APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS_MODE`, `SMTP_FROM`; optionally SMTP username/password/reply-to | Email links and lifecycle messages. Username and password must be set together. |
| Directory validation | `ENTRA_DIRECTORY_TENANT_ID`, `ENTRA_DIRECTORY_CLIENT_ID`, `ENTRA_DIRECTORY_CLIENT_SECRET`, `ENTRA_ALLOWED_EMAIL_DOMAIN` | Validates collaboration invitees through Microsoft Graph. |
| GitHub App | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_ALLOWED_ORGS`, `GITHUB_DEFAULT_ORG`, `GITHUB_DEFAULT_REPO_VISIBILITY`, plus `GITHUB_APP_INSTALLATION_ID` or `GITHUB_APP_INSTALLATIONS_JSON` | Repository creation/import, collaborators, Actions secrets, dispatch, and managed-repository deletion. |
| Managed app publishing | all `AZURE_PUBLISH_*` variables in `.env.example` | Shared Azure target, portal runtime identity, generated-app authentication, and Microsoft Graph updates. |

The complete variable list and expected defaults are maintained in [`.env.example`](../../.env.example). Validation logic is in `src/lib/env.ts`, `src/features/repositories/config.ts`, `src/features/notifications/config.ts`, `src/features/directory/config.ts`, and `src/features/publishing/azure/config.ts`.

## Local Development and Reproduction

### Prerequisites

- Node.js 24 or later
- Docker Desktop or compatible Docker runtime
- npm (use the committed `package-lock.json`)
- PostgreSQL, supplied locally by the Compose service
- Entra application credentials for normal sign-in testing

### First run

1. Copy `.env.example` to `.env` and fill in the core database and Entra values.
2. Install dependencies: `npm install`.
3. Start PostgreSQL: `npm run db:up`.
4. Apply all committed migrations: `npm run prisma:migrate:deploy`.
5. Synchronize the template catalog: `npm run prisma:seed`.
6. Start the server: `npm run dev`.

The local database is `postgresql://portal:portal@localhost:5432/portal?schema=public`. The Compose service exposes PostgreSQL on port 5432. Use `npm run db:logs` and `docker compose ps postgres` when database startup is suspect.

`prisma.config.ts` deliberately loads `.env` and `.env.local` for Prisma commands. The seed command deliberately uses Node's environment-file support rather than running the `tsx` CLI directly. Do not casually replace this command; the direct CLI previously had IPC/socket failures in this environment.

### Test and build commands

```bash
npm test
npm run build
npm run test:e2e
```

The Playwright suite sets `E2E_AUTH_BYPASS=true`. This is narrowly scoped test infrastructure that bypasses Entra configuration and supplies a test user; it must never be enabled in production.

When reproducing a problem, use a fresh local app record or a non-production database. Do not point a local process at production Azure publishing credentials unless the change is an approved production operation.

### Safe reset boundary

`npm run db:reset` runs `docker compose down -v` and destroys the local Compose database volume. It is appropriate only for disposable local data. It does not affect Azure PostgreSQL, but it removes all local portal records.

## Portal Self-Hosting in Azure

### Expected production topology

The checked-in deployment manifest describes the baseline:

- Resource group: `rg-cu-app-portal`
- Linux App Service plan: `asp-cu-app-portal-s1` (the name may remain historical even if its SKU changes)
- Web App: `cu-app-portal`
- PostgreSQL flexible server: `psql-cu-app-portal-260424`
- Database: `cu-app-portal`
- Runtime: `NODE|24-lts`

Treat these as current baseline names, not a license to recreate resources blindly. Confirm the live subscription and resource IDs before provisioning or deletion.

### Deploy pipeline

The workflow `.github/workflows/deploy-azure-app-service.yml` deploys on pushes to `main` and through manual dispatch. It:

1. checks out the repository,
2. installs dependencies with `npm ci`,
3. runs `npm run build`,
4. packages `.next`, production dependencies, Prisma files, `templates/`, `docs/user/`, and public assets into `release/`,
5. authenticates to Azure with GitHub OIDC, and
6. deploys the package to the configured Web App.

The portal repository must have `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` GitHub Actions secrets. The Azure identity must have enough rights over the portal Web App to deploy. The workflow's environment hardcodes `AZURE_WEBAPP_NAME=cu-app-portal`; update both the workflow and operations documentation if that web app is renamed.

Set the portal App Service startup command to:

```bash
npm run prisma:migrate:deploy && npm start
```

Required portal App Service settings are the Core portal variables above, plus both `AUTH_URL` and `NEXTAUTH_URL` set to the exact public HTTPS origin. Production `DATABASE_URL` must use the Azure PostgreSQL endpoint with `sslmode=require`.

Before deploying, complete application-setting changes and allow the SCM/Kudu container to settle. Rapid configuration changes followed immediately by ZIP deployment can restart SCM and abort the deployment. The historical operations notes also document an Azure quota issue and default `azurewebsites.net` Chrome reputation caveat; consult [publishing lessons learned](../publishing/lessons-learned.md).

### Portal self-hosting verification

After a deployment:

1. Check that the GitHub Actions build and Azure deploy steps succeeded.
2. Load the portal's public URL over HTTPS.
3. Verify Entra redirects back to the same public host, never `localhost`.
4. Sign in with a test Cedarville account and complete a low-risk read operation.
5. Confirm a database-backed operation such as viewing templates or `/apps` works.
6. Inspect App Service logs and GitHub deployment logs if the process starts but requests fail.

If a migration fails, do not suppress it by changing the startup command. Read the migration error, compare deployed code to the database migration history, and escalate to engineering if a manual database repair is required.

## Microsoft Entra Administration

Two Entra application concerns exist:

1. The portal sign-in registration, configured by `AUTH_MICROSOFT_ENTRA_ID_*`.
2. The shared generated-app registration, configured by `AZURE_PUBLISH_ENTRA_*`, whose redirect URIs are managed for apps that select Entra login.

For the portal sign-in registration, include the Auth.js callback for each permitted origin, normally:

```text
https://<portal-host>/api/auth/callback/microsoft-entra-id
```

Keep the local callback only when local normal-auth development is required. After moving the portal to a custom domain, update `AUTH_URL`, `NEXTAUTH_URL`, and the Entra redirect URI together. A mismatch commonly appears as an Entra redirect error or a return to a localhost URL.

For collaboration-invite validation, the directory application needs Microsoft Graph permission to read users and alias evidence. The expected application permission is `User.Read.All` unless Cedarville has approved a narrower alternative.

For managed publishing, the portal runtime identity uses Microsoft Graph to add redirect URIs to the shared generated-app registration and to manage federated identity credentials on the publisher application. A Graph `403 Authorization_RequestDenied` normally means expired/rotated configured credentials or missing Graph permissions; capture the Graph request ID shown in publishing setup status and escalate to the Entra/Azure administrator.

## GitHub App Administration

The GitHub App is the portal's service identity. It creates repositories, imports compatible repositories, manages collaborators, writes portal-managed Actions secrets, reads Actions status, dispatches deployments, and deletes managed repositories when a scoped deletion requests it.

### Installation requirements

- Install the GitHub App in every org listed in `GITHUB_ALLOWED_ORGS` that the portal will manage.
- `GITHUB_DEFAULT_ORG` must be allowed and must have an installation ID supplied either by `GITHUB_APP_INSTALLATION_ID` or `GITHUB_APP_INSTALLATIONS_JSON`.
- Store the private PEM key only in the approved secret store. A single-line value with literal `\n` is supported; a multiline PEM is also supported.
- Permit sufficient repository administration to create and delete managed repositories, read private source repositories to import them, manage collaborators, and read/write GitHub Actions secrets and workflow dispatches.

The implementation queries GitHub directly using an installation token. It does not use an end-user OAuth token or personal access token. Therefore a report that a user can see a repository in their own GitHub account does not prove the portal GitHub App can read it.

### GitHub workflow and OIDC expectations for managed apps

Managed apps use `.github/workflows/deploy-azure-app-service.yml`. The portal manages these repository secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_WEBAPP_NAME`

The portal also manages a GitHub OIDC federated credential for the app. Repositories may use the older name-based subject or the immutable subject introduced for repositories created after July 15, 2026. The portal reads the repository's OIDC subject configuration and identity before preflight, publish, and repair; do not manually replace the credential without first recording the existing subject.

## Managed App Azure Publishing

### Shared resource model

The portal creates or configures each managed app in the publish resource group:

- One shared App Service plan and one shared PostgreSQL flexible server.
- One Azure Web App per app request.
- One PostgreSQL database per app only when PostgreSQL is selected.
- One RBAC-mode Key Vault per app that uses secret user-managed environment variables.

Names are deterministic from the app name and the first eight normalized characters of the request ID: Web Apps begin with `app-`, Key Vaults with `kv-`, databases with `db_`, and federated credential names with `github-`. Every portal-created resource is tagged `managedBy=cu-app-portal` and includes the app request ID and support reference. The portal will refuse to treat an existing, untagged resource as its own.

### Required Azure permissions

The portal publishing identity (`AZURE_PUBLISH_CLIENT_ID`) requires scoped permissions on the publish resource group:

- **Contributor** to create/configure Web Apps, databases, Key Vaults, and managed identities.
- **Key Vault Secrets Officer** to set and delete secrets in RBAC-mode Key Vaults.
- **Role Based Access Control Administrator**, constrained by ABAC to assigning only **Key Vault Secrets User**, so the portal can grant a Web App's system-assigned identity read access to its own vault.

The `docs/portal/setup.md` file contains the approved role-assignment shape and ABAC condition. Key Vaults soft-delete for 90 days; the portal never purges them.

### Publishing setup states and safe response

| State | Meaning | Tier 1 response | Tier 2 response |
| --- | --- | --- | --- |
| `READY` | Required checks passed. | Direct user to publish/retry as appropriate. | Investigate deployment only if the workflow itself fails. |
| `NEEDS_REPAIR` | A repairable prerequisite is missing or stale. | Collect reference and recommend **Repair Publishing Setup** to an owner/collaborator/admin. | Run repair; inspect failing check and provider response if it persists. |
| `BLOCKED` | A prerequisite is not repairable by the portal. | Escalate with support reference; do not advise repeated retries. | Correct Azure/Graph/GitHub permissions or external state, then run repair. |
| `NOT_CHECKED` / `CHECKING` / `REPAIRING` | Status is not final. | Wait for the action to finish; avoid duplicate actions. | Check audit records/provider availability if it remains stuck. |

**Repair Publishing Setup** refreshes only portal-managed GitHub Actions secrets and OIDC/federated credentials, plus necessary portal-managed Azure/Entra setup. It does not delete repositories or Azure resources and does not dispatch a deployment. Use **Retry Publish** when setup is already healthy and the goal is to rerun the workflow.

### Per-app publishing triage

1. Verify that the app record has a managed repository in `READY` state and a default branch.
2. Read the publishing setup checks on the app details page. Note the failed check key: Azure resource access, app settings, Entra redirect URI, GitHub federated credential, GitHub Actions secrets, workflow file, or workflow dispatch.
3. For `NEEDS_REPAIR`, run repair once after confirming the portal's Azure/Entra/GitHub credentials are current.
4. For GitHub workflow failures, open the workflow run linked from the portal and diagnose build/deploy errors in the managed repository. The portal only dispatches and tracks the run; application source errors belong to the managed repository.
5. For `Authorization_RequestDenied`, first verify that the `AZURE_PUBLISH_*` credentials have not expired or rotated. Then verify Graph permissions for shared app-registration redirect URI and federated-credential updates.
6. If the resource exists but repair reports it is not portal managed, compare its tags with the app request ID. Do not overwrite or delete an untagged resource; it may belong to another workload.

## Common Incidents

| Symptom | First checks | Likely owner / resolution |
| --- | --- | --- |
| Everyone receives a portal error or cannot load the site | Azure App Service availability, latest deployment, application logs, database reachability | Tier 2 / engineering. Do not alter database data while diagnosing availability. |
| Sign-in fails before or after Entra | Exact public origin, `AUTH_URL`, `NEXTAUTH_URL`, Entra callback URI, client secret expiry, user email domain | Entra/portal administrator. The user must have a Cedarville email. |
| User signed in but sees no app | Correct account, app owner/collaborator record, admin visibility | Tier 2 through `/admin`; do not create duplicate app records as a workaround. |
| First admin has no access | `PORTAL_INITIAL_ADMIN_EMAILS`, matching lowercase user email, whether another admin already exists | Tier 2. Bootstrap only works while no admins exist; then manage roles in `/admin`. |
| Repository creation or import fails | GitHub App installation, target org, installation ID mapping, private-key validity, source-repo visibility | GitHub administrator / Tier 2. Confirm the App, not just the user, can access the source. |
| Invite email not sent / invite cannot validate | SMTP configuration, `PORTAL_APP_URL`, directory credentials, Graph permission, email domain | Tier 2 / messaging or Entra admin. Collaboration invitations always attempt sending regardless of notification preference. |
| Normal notifications missing | User notification preference, SMTP delivery/logs, sender policy | Tier 2 / messaging administrator. |
| Publishing setup needs repair | Failed setup check and credential rotation history | Owner/collaborator/admin may run repair; Tier 2 investigates repeat failure. |
| Publish run fails after dispatch | GitHub Actions run URL, runtime/workflow error, app's Azure Web App logs | App owner/developer for source errors; Tier 2 for Azure/GitHub platform errors. |
| User asks to delete an app | Confirm exact scopes: portal record, GitHub repository, Azure deployment | Owner or admin. Warn that leaving GitHub/Azure unchecked orphanes those resources after portal record deletion. |

## Logs, Audit Evidence, and Data Handling

The portal records audit events for security and lifecycle actions. Use the administrative event view and app details status first. Publishing setup-check metadata is deliberately sanitized: secret values must never be stored in support notes, portal records, screenshots, or tickets.

When a provider returns a request/correlation ID, retain that identifier with the support reference. It lets Azure, GitHub, or Entra administrators locate the server-side event without exposing credentials.

Production database access is break-glass activity. Before running any direct SQL:

1. establish the incident/change record and backup/rollback plan;
2. confirm that the portal UI cannot safely perform the action;
3. use a read-only query first;
4. do not change ownership, repository state, publishing state, tokens, or audit data without engineering approval; and
5. document every statement and result in the incident.

## Maintenance and Change Checklist

Before a code release:

1. Review the diff for migrations, templates, authentication, GitHub, Azure publishing, and environment-variable changes.
2. Run targeted tests for changed subsystems, then `npm test` and `npm run build` when practical.
3. For template catalog changes, run `npm run prisma:seed` against the deployment database as part of the controlled release process.
4. For a schema migration, verify the startup migration command succeeds against a production-equivalent database before release.
5. Confirm the deployment artifact continues to contain `templates/` and `docs/user/`; both are runtime dependencies.
6. Verify production configuration changes before triggering the deployment, then wait for App Service/SCM configuration to stabilize.

After changes to templates, auth, repository setup, publishing, imports, or local setup, update the corresponding portal documentation. Keep generated app skills and template publishing assets consistent with shared generation code.

## Useful Repository Locations

| Purpose | Location |
| --- | --- |
| Environment example | `.env.example` |
| Local database service | `compose.yaml` |
| Database schema and migrations | `prisma/schema.prisma`, `prisma/migrations/` |
| Template catalog and seeding | `src/features/templates/catalog.ts`, `prisma/seed.ts`, `templates/` |
| Authentication | `src/auth/config.ts`, `src/auth/session.ts`, `src/middleware.ts` |
| GitHub App client/configuration | `src/features/repositories/` |
| Publishing setup and status | `src/features/publishing/setup/`, `src/features/publishing/azure/` |
| Azure self-deployment workflow | `.github/workflows/deploy-azure-app-service.yml` |
| Portal deployment baseline | `app-portal/deployment-manifest.json` |
| User-facing Help source and generated PDFs | `docs/user/`, `public/docs/`, `output/pdf/` |
| Historical deployment notes | `docs/publishing/lessons-learned.md` |

## Related Documentation

- [Portal setup](setup.md) — configuration details and command reference.
- [Template authoring](template-authoring.md) — template generation contract.
- [Azure App Service deployment](../publishing/azure-app-service.md) — portal self-deployment details.
- [Publishing lessons learned](../publishing/lessons-learned.md) — recorded production observations and recovery notes.
