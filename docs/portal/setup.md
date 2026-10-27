# CU Launch Setup

This guide explains local development, required environment variables, and database setup for CU Launch.

## Requirements

- Node.js 24+
- Docker Desktop or another local Docker runtime
- A PostgreSQL database
- Microsoft Entra ID application credentials for Cedarville SSO

## Environment Variables

Add these values to `.env` for local development:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_MICROSOFT_ENTRA_ID_ID`
- `AUTH_MICROSOFT_ENTRA_ID_SECRET`
- `AUTH_MICROSOFT_ENTRA_ID_ISSUER`
- `PORTAL_INITIAL_ADMIN_EMAILS`

Keep real secret values only in ignored local env files or managed secret
stores such as Azure App Service application settings and GitHub Actions
secrets. Do not paste real secret values into tracked docs, examples, tests,
or templates.

### Last-login tracking

Portal Entra sign-in writes `User.lastLoginAt` for both new and returning users. The admin Users page displays it in Eastern time. Migration `20261027140000_add_user_last_login` adds a nullable column; run `npm run prisma:migrate:deploy` before starting the updated portal. Existing rows remain null (**Never recorded**) until the next sign-in. Session reuse, profile edits, and MCP requests do not count as new sign-ins.

### Optional Codex workspace-plugin MCP API

The portal's MCP API is disabled by default. Keep `PORTAL_MCP_ENABLED=false`
locally unless an administrator is testing a real delegated Entra resource.
The normal Auth.js settings above create browser sign-in sessions for the
portal UI. Auth.js browser credentials do not automatically configure the
delegated MCP resource, and they cannot authorize `/api/mcp`.

When, and only when, the administrator-owned Entra registration is ready, add
these application settings to the deployed portal. Do not put registration
values, tokens, or client secrets in this repository.

| Setting | Required enabled-state value |
| --- | --- |
| `PORTAL_MCP_ENABLED` | `true` only after the rollout gates in the plugin runbook pass; otherwise `false`. |
| `PORTAL_MCP_RESOURCE_URL` | The canonical public portal origin followed by exactly `/api/mcp`; it must be HTTPS and match `PORTAL_APP_URL`'s origin. |
| `PORTAL_MCP_ENTRA_TENANT_ID` | The Cedarville Entra tenant ID for the delegated resource. |
| `PORTAL_MCP_ENTRA_ISSUER` | The exact public Entra v2 issuer for that tenant. |
| `PORTAL_MCP_ENTRA_AUDIENCE` | The audience registered for this MCP resource. |
| `PORTAL_MCP_ENTRA_SCOPE` | The delegated API scope granted to the Codex/OpenAI client. |

When enabled, the route accepts only bearer tokens for the configured resource
and checks the issuer, tenant ID, audience, expiry/not-before times, required
delegated scope, Entra object ID, and a normalized `@cedarville.edu` identity.
App-only role tokens and browser-session cookies do not satisfy this check.
`/.well-known/oauth-protected-resource` publishes protected-resource metadata
for the same resource; it is not a public substitute for the `/api/mcp` tools.

The following optional values can lower a per-user limit but cannot raise it
above the approved default. Their windows are fixed:

| Setting | Approved maximum |
| --- | --- |
| `PORTAL_MCP_RATE_READ_MAX` | 120 requests / 10 minutes |
| `PORTAL_MCP_RATE_CREATE_MAX` | 3 requests / hour |
| `PORTAL_MCP_RATE_GITHUB_ACCESS_MAX` | 10 requests / hour |
| `PORTAL_MCP_RATE_PUBLISH_MAX` | 6 requests / hour |
| `PORTAL_MCP_RATE_REPAIR_MAX` | 3 requests / hour |
| `PORTAL_MCP_RATE_RETRY_MAX` | 6 requests / hour |

Use the full rollout, rollback, monitoring, and evidence guidance in
[Codex workspace plugin operations](codex-workspace-plugin.md). Do not turn on
the endpoint merely because portal UI sign-in works.

Use `PORTAL_INITIAL_ADMIN_EMAILS` to bootstrap portal-managed admin access with comma-separated Cedarville email addresses. When the portal has no admins yet, a matching signed-in user receives the portal-managed `ADMIN` role. After the first admin exists, use `/admin` to add or remove admin access.

To enable portal-managed GitHub repository creation during the create flow, also set:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_ALLOWED_ORGS`
- `GITHUB_DEFAULT_ORG`
- `GITHUB_DEFAULT_REPO_VISIBILITY`
- `GITHUB_APP_INSTALLATION_ID` or `GITHUB_APP_INSTALLATIONS_JSON`

Notes for GitHub App setup:

- `GITHUB_APP_PRIVATE_KEY` can be stored as a multi-line PEM or as a single-line value with escaped `\n` characters.
- GitHub App private key PEM downloads should stay outside tracked files. The repo ignores common key and certificate file extensions, and `.env.example` intentionally leaves private-key fields blank.
- Use `GITHUB_APP_INSTALLATION_ID` when all generated repos target one org.
- Use `GITHUB_APP_INSTALLATIONS_JSON` when different Cedarville orgs need different installation ids, for example `{"cedarville-it":"111","cedarville-apps":"222"}`.
- `GITHUB_DEFAULT_ORG` must match one of the orgs allowed by `GITHUB_ALLOWED_ORGS`.
- The GitHub App needs enough repository administration permission to delete portal-managed repositories when a user selects GitHub deletion from `My Apps`.

### Add Existing App

The home page routes **Launch New App** and **Add Existing App** through the initial onboarding wizard. New-app users are told that template selection is next. Existing-app users receive separate **Already on GitHub** and **Only on my computer** routes, with the selected form identified by the query string and heading (the local route also uses `#local-app`). After a repository is created or imported, the user enters a focused setup sequence for GitHub access, optional Codex handoff, repository preparation, and an explicitly requested first Azure publish.

Template creation never publishes automatically. The generated-app form requires the user to choose Cedarville sign-in or openly public access; an openly public choice requires acknowledgement that anyone who knows or discovers the address can use the app. After creation, **Publish the starter now** starts Azure publishing immediately and is the only publish confirmation for an unchanged generated starter. **Customize it with Codex first** takes the user through GitHub access, customization, and setup before a later **Publish to Azure** action. Users who customize or upload local code are first asked whether they have a GitHub account. Account creation guidance explains that the username is chosen during signup and appears after `github.com/` in the profile address before the portal displays the username form. Imported apps are prepared only after the user requests it; publishing-file conflicts use a pull request for review instead of overwriting files. Local apps use a Codex-owned upload flow and must not advance until the user selects **My code has been uploaded** after Codex confirms the push.

A saved GitHub username or legacy repository-access status does not skip the generated starter-or-customize choice. The unchanged starter path does not require GitHub or Codex. Only the customization, local upload, and imported-repository conflict paths evaluate access for the current signed-in actor. A request must match that actor's saved GitHub username. Actor-specific invite, grant, and failure results remain in append-only audit events for presentation, while an authoritative per-app grant ledger retains every GitHub identity needed for later revocation.

The onboarding page auto-refreshes while repository creation, preparation, publishing setup, or publishing is in progress. After a direct preparation commit or verified review merge for an imported/local app, the portal automatically creates or refreshes its publishing resources and checks readiness through the actor-authorized setup service. Missing first-time resources are created before readiness is checked, so normal preparation proceeds directly to **Publish to Azure** without a manual repair step. Setup uses the same atomic claim and per-mutation authorization as manual setup, and does not dispatch deployment. If setup cannot finish, repository preparation remains committed. Older first-time requests needing manual completion use **Finish publishing setup**, while failed or previously published releases retain **Fix publishing setup**. Recovery stays in the focused wizard: preparation can be retried with the saved method, unsupported local apps return to Codex repair, and failed setup offers **Fix publishing setup** without dispatching a deployment. For customized generated apps and imported or local apps, **Publish to Azure** is the separate confirmation shown after preparation and setup; it is not a second confirmation after **Publish the starter now**. After a successful publish, onboarding offers a direct live-app link as well as the full details page. My Apps sends every unpublished request to **Continue Setup** and every successfully published request to **Manage App**. The details page shows a readiness summary and portal-sharing controls first; repository, Codex, environment-variable, and publishing diagnostics are collapsed under **Advanced options**.

Generated managed repositories use a stable request-unique target name plus a request ownership marker. Repository recovery treats a name collision as unowned unless the existing remote carries the exact request marker. An owned partial repository is completed from its existing tree, and the default branch advances only when its head still matches the head read for that attempt. Duplicate retry submissions and duplicate publishing-setup repair submissions are atomically claimed before any provider mutation.

The add-existing-app flow uses the same GitHub App configuration as portal-managed repository creation. In V1, the portal accepts repositories it can read through the configured GitHub App installation or through public GitHub access; there is no user GitHub OAuth or personal access token access in V1.

When a submitted repository is outside `GITHUB_DEFAULT_ORG`, the portal imports it into the default org with a short-lived GitHub App installation token and preserves the source repository history. The GitHub App needs repository creation permission in the target org, plus read access to private source repositories that are imported.

If a user has built an app locally with Codex but has not created any GitHub repository yet, the portal creates the destination repository directly in `GITHUB_DEFAULT_ORG` with only the canonical `.codex/skills/cu-app-portal/SKILL.md` guidance in its first commit. The onboarding prompt initializes the local folder if needed, preserves existing history and remotes, adds a verified managed remote, and pulls that guidance commit before app changes. For an unrelated existing history, Codex uses a non-rebase pull that preserves both histories and stops rather than overwriting a conflict. The pulled skill owns framework recognition and the smallest safe migration to a supported root Next.js, Express, FastAPI, or static app before tests and upload. GitHub CLI (`gh`) is not required for this path.

Customization and local-upload handoffs require a **local Codex project** before the prompt is used. For generated apps, the user creates a new empty folder and makes it the project's primary folder; for local and imported GitHub apps, reuse the existing local Codex project and app folder. Imported GitHub handoffs preserve the source remote (normally `origin`) and add or reuse a verified HTTPS `portal` remote for the managed publishing repository. If `portal` points elsewhere, preserve it and choose an unused name. Inspect uncommitted work and fetch portal changes before editing or pushing; never replace remotes, force-push, or discard local work to synchronize. No separate empty folder or new Codex project is required for an existing checkout. Portal copy must explicitly say not to use Quick chat or a standalone task outside that project. Windows users install Git from **Company Portal**. On macOS, Git should be installed automatically by Cedarville login scripts. If Git is unavailable on macOS, contact Cedarville IT for help. After installing Git, the user completely quits and reopens Codex. Handoff prompts include the signed-in user's GitHub username and portal email for repository-local Git commit author settings (`user.name` and `user.email`) before committing; secure GitHub sign-in still authorizes pushes. The prompt runs `git --version` first and, when Git is missing, must stop and provide those managed-install steps; it must not attempt an installation. GitHub operations use HTTPS and secure browser or operating-system sign-in. Prompts must not ask for passwords, personal access tokens, SSH keys, portal credentials, or other secrets. With Git available, Codex owns connection recovery in order: existing Git authentication, credential-helper diagnosis and repair, available GitHub plugin tools, then GitHub CLI. It may install the official CLI through an existing package manager without administrator access or a checksum-verified official release in a user-writable tools directory. GCM installed alongside `osxkeychain` should trigger a scoped GCM attempt; `git credential-manager configure` and `gh auth setup-git` must not be used as blanket global repairs. Use command-scoped helpers before cloning and repository-local, GitHub-specific helpers afterward. Plugin authentication is separate from local Git authentication, and `gh` still requires Git for cloning. Bound failed attempts, distinguish authentication from network/path/SSO/permission failures, and retry after meaningful repairs. Ask the user only for required secure sign-in or consent, then resume and verify the actual Git operation. Successful cloning does not prove write access; verify the actual push when changes are ready. Escalate only after applicable methods are exhausted or a confirmed administrative restriction requires IT.

V1 supports root Next.js apps, Express apps, Python FastAPI apps, and plain static Python `http.server` apps with a root `index.html` for Azure App Service publishing. After import or scan, the portal prepares the repository for the matching supported Azure App Service publishing path. Both GitHub and local import forms offer **Add a database** (no new database or PostgreSQL) and **Require Cedarville login** (Cedarville sign-in or openly public access). New forms default to no new database and Cedarville sign-in. Explicit choices are saved in `submittedConfig.importFeatures` and mirrored to the publishing feature fields. Preparation and review verification retain them across Next.js, Express, and FastAPI instead of replacing them with runtime defaults. Older requests without explicit choices keep the prior defaults: PostgreSQL and Entra for Next.js, neither for Express, FastAPI, or static apps.

The portal provisions selected resources and settings; it does not rewrite arbitrary imported app code or migrate existing data. GitHub import onboarding shows a visible **Continue with Codex** card before the preparation action as soon as the managed copy is ready, including older imports and imports without new services. The copy button stays visible; project help and the prompt preview can be expanded. The card first offers GitHub username/invitation steps if access is not yet confirmed; local imports include the choices in the upload/repair prompt. The full details page also includes them in its handoff. Codex must implement server-only `DATABASE_URL` access, tables and migrations, and verified server-side Cedarville Entra authentication as selected. FastAPI uses `/auth/callback`; Next.js and Express use `/api/auth/callback/microsoft-entra-id`, matching portal registration. Production credentials remain portal-managed. Local fixture tests do not replace live database and sign-in verification after provisioning.

A plain static `http.server` app cannot use either selected service. Preparation blocks it before writing publishing files, with instructions to have Codex migrate it to a supported Next.js, Express, or FastAPI server and upload the changes. Static apps selecting neither service retain the existing static publishing path. Selecting no new services preserves existing app storage and authentication; it does not remove them.

### Portal-Managed Azure Publishing

To enable portal-managed Azure publishing for generated user apps, configure the portal with the shared Azure publish target and generated-app auth settings:

- `AZURE_PUBLISH_RESOURCE_GROUP=rg-cu-apps-published`
- `AZURE_PUBLISH_APP_SERVICE_PLAN=asp-cu-apps-published`
- `AZURE_PUBLISH_POSTGRES_SERVER=psql-cu-apps-published`
- `AZURE_PUBLISH_POSTGRES_ADMIN_USER`
- `AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD`
- `AZURE_PUBLISH_LOCATION`
- `AZURE_PUBLISH_RUNTIME_STACK=NODE|24-lts`
- `AZURE_PUBLISH_TENANT_ID`
- `AZURE_PUBLISH_SUBSCRIPTION_ID`
- `AZURE_PUBLISH_AUTH_SECRET`
- `AZURE_PUBLISH_ENTRA_CLIENT_ID`
- `AZURE_PUBLISH_ENTRA_CLIENT_SECRET`
- `AZURE_PUBLISH_ENTRA_ISSUER`
- `AZURE_PUBLISH_ENTRA_APP_OBJECT_ID`

Current v1 design decisions:

- Provisioning and Repair Publishing Setup enforce `SCM_MAX_ZIP_PACKAGE_COUNT=2` on each managed Web App, including imported runtimes. This limits retained deployment ZIPs during Azure deployments; setting it does not immediately delete existing packages. The limit is per app, while the plan's storage quota is shared. Apply the same setting to existing Web Apps when rolling out this change.

- Generated user apps share one Azure resource group: `rg-cu-apps-published`.
- Generated user apps share one App Service Plan: `asp-cu-apps-published`.
- Generated user apps share one PostgreSQL flexible server: `psql-cu-apps-published`.
- Each published app gets its own Azure Web App. When PostgreSQL is selected for that app, it also gets its own PostgreSQL database on the shared server.
- Each published app gets its own user-assigned managed identity (`id-{slug}-{shortRequestId}`) that holds the app's GitHub OIDC federated credential and is assigned **Website Contributor** on that app's Web App only. The repository's `AZURE_CLIENT_ID` secret is this identity's client ID, so a repository can deploy to its own app and nothing else. Microsoft caps an identity at 20 federated credentials; one identity per app keeps the portal clear of that limit.
- Managed-app deployment workflows verify Azure OIDC login immediately. If Azure has not yet recognized a new deploy identity's Website Contributor assignment, the workflow retries that login after 30 seconds and 60 seconds; it deploys immediately after the first successful login.
- `AZURE_PUBLISH_RUNTIME_STACK=NODE|24-lts` remains the current default for the legacy/imported Node publishing path.
- Runtime-specific generated templates and prepared imported apps carry their App Service runtime stack in the deployment manifest. The portal-managed publisher uses that runtime when creating the Web App.
- FastAPI Web Apps use Azure App Service build automation: `SCM_DO_BUILD_DURING_DEPLOYMENT=true` and `ENABLE_ORYX_BUILD=true`. The portal removes `WEBSITE_RUN_FROM_PACKAGE` for FastAPI because Python App Service does not support that mode. Generated and prepared FastAPI workflows deploy source, and Oryx installs dependencies from the root `requirements.txt` or supported `pyproject.toml` configuration.
- Database and auth publishing are conditional based on the selected template or imported app features. Apps that do not select PostgreSQL skip per-app database setup, and apps that do not select Microsoft Entra login skip auth settings and redirect URI setup.
- The create flow groups catalog choices into Recommended Templates for common non-technical app shapes and Developer Starters for lower-level runtime-oriented starts. Some recommended presets reuse the shared Next.js source while applying stricter database defaults; every active generated template still requires an explicit Cedarville-sign-in or openly-public audience choice.

Deletion behavior:

- `My Apps` deletion is scoped. Users can delete the portal record, the managed GitHub repository, and the Azure deployment independently.
- Azure deletion removes the selected app's Azure Web App, its deploy identity, and, if provisioned, the selected app's PostgreSQL database and Key Vault.
- Azure deletion never deletes the shared PostgreSQL flexible server.
- If a user leaves GitHub or Azure unchecked while deleting the portal record, those resources must be deleted manually later because the portal record will no longer appear in `My Apps`.

### Azure Permissions for the Portal Runtime Identity

The portal authenticates to Azure with `DefaultAzureCredential`. The identity
it resolves to (a managed identity on the portal's App Service, or a service
principal in local development) is the **portal runtime identity**. It needs,
scoped to the publish resource group:

1. **Contributor** — creates and deletes Web Apps, databases, Key Vaults,
   and each app's user-assigned managed identity with its federated
   credential; enables web app system-assigned identities.
2. **Key Vault Secrets Officer** — sets and deletes secret values in the
   RBAC-mode vaults that back user-managed environment variables
   (`kv-{slug}-{shortRequestId}`). Secrets reach the running app through Key
   Vault references resolved by the web app's system-assigned identity.
3. **Role Based Access Control Administrator** — grants each web app's
   system-assigned identity `Key Vault Secrets User` on its own vault, and
   grants each app's deploy identity `Website Contributor` on its own Web
   App. Constrain it with an ABAC condition so it can assign only those two
   roles.

Set `PORTAL_RUNTIME_CLIENT_ID` to the client ID of the portal runtime
identity before running the commands below.

```bash
az role assignment create \
  --assignee "$PORTAL_RUNTIME_CLIENT_ID" \
  --role "Key Vault Secrets Officer" \
  --scope "/subscriptions/$SUB_ID/resourceGroups/rg-cu-apps-published"

az role assignment create \
  --assignee "$PORTAL_RUNTIME_CLIENT_ID" \
  --role "Role Based Access Control Administrator" \
  --scope "/subscriptions/$SUB_ID/resourceGroups/rg-cu-apps-published" \
  --condition "((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6, de139f84-1756-47ae-9be6-808fbbe84772})) AND ((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6, de139f84-1756-47ae-9be6-808fbbe84772}))" \
  --condition-version "2.0"
```

`4633458b-17de-408a-b874-0445c86b69e6` is Key Vault Secrets User and
`de139f84-1756-47ae-9be6-808fbbe84772` is Website Contributor. If an existing
assignment still carries the single-GUID condition, update it in place before
deploying a portal build that creates per-app deploy identities; otherwise
provisioning fails at the role assignment and the app shows `BLOCKED` with an
Azure permission message.

Deleted vaults soft-delete for 90 days; the portal never purges them.

### Admin And Collaboration Permissions

- Each app has one primary owner.
- Admins can see all users and apps, manage admin roles, reassign owners, manage collaborators, and delete scoped app resources.
- App owners and admins can remove accepted collaborators from the app details screen.
- Collaborators can view app details, request GitHub repository access for themselves, repair publishing setup, and publish app changes.
- Collaborators cannot delete app resources or reassign ownership.

### Notifications And Collaboration Invites

Set `PORTAL_APP_URL` to the public portal origin used in email links. Configure SMTP with `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS_MODE`, `SMTP_FROM`, and optional username, password, and reply-to values.

The worker deployment workflows copy every `SMTP_*` setting from the main `cu-app-portal` App Service in `rg-cu-app-portal` into the repository-import, publishing, and publishing-recovery jobs. This includes `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS_MODE`, `SMTP_FROM`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_REPLY_TO`, and future settings with that prefix. After changing App Service settings, run both **Deploy Repository Import Worker** and **Deploy Publishing Worker** workflows (or let their next automatic deployments run). Existing executions retain their previous environment. `PORTAL_APP_URL` is configured independently.

All copied values are stored as Container Apps Job secrets and referenced by the container environment. The helper submits a temporary JSON/YAML file with mode `0600` in a private directory, then deletes it on success or failure. Values are kept out of command arguments, workflow outputs, and logs. Missing or empty optional settings remove old environment entries, including old SMTP credentials; required host, port, and sender settings must be present. Values must be literal, single-line strings; App Service Key Vault references are rejected rather than copied as unresolved text. Azure errors during updates are summarized without including their potentially sensitive response bodies.

The GitHub Actions Azure identity must be able to read the portal's app settings (`Microsoft.Web/sites/config/list/action`, scoped to that App Service). Azure returns the full settings collection for this operation; the deployment helper selects only `SMTP_*` settings and does not print them. From an authenticated Azure CLI session with role-definition and role-assignment write permissions, grant and verify a custom role containing only this action:

```bash
node scripts/workers/grant-portal-smtp-read.mjs <CI-service-principal-object-id>
```

Use the service principal object ID for the GitHub Actions identity referenced by `AZURE_CLIENT_ID`, rather than the client ID itself. The script defaults to `rg-cu-app-portal` and `cu-app-portal`; optional second and third arguments override the resource group and App Service. Re-running the script verifies an existing matching assignment without creating duplicates. The role is assignable within the portal resource group, and the assignment is scoped to the portal App Service only. It permits reading all App Service settings because Azure cannot restrict this API to individual setting names. Worker identities receive no new permissions.

Collaboration invites validate coworkers against Entra before sending. Configure `ENTRA_DIRECTORY_TENANT_ID`, `ENTRA_DIRECTORY_CLIENT_ID`, `ENTRA_DIRECTORY_CLIENT_SECRET`, and `ENTRA_ALLOWED_EMAIL_DOMAIN=cedarville.edu`. The directory app registration needs Microsoft Graph permission to read users and alias evidence; the expected app-only permission is `User.Read.All` unless Cedarville validates a narrower delegated or app-only permission path.

Invite acceptance grants portal app access only. Users request GitHub repository access separately from the app details page.

#### Publishing setup repair

Repair Publishing Setup refreshes portal-managed GitHub Actions secrets and GitHub OIDC federated credentials for a target app when configured Azure, Entra, or GitHub values rotate. Repair removes or resets only the portal-managed publishing secrets and credentials for that app.

GitHub repositories can use either the legacy name-based OIDC subject or the immutable subject introduced for repositories created after July 15, 2026. The portal reads the repository's OIDC configuration and GitHub owner/repository IDs before preflight, publish, and repair. Repair deletes the portal-managed federated credential with the stale subject before creating the credential with the repository's current subject format; older repositories that still use legacy subjects remain supported.

If the correct subject already exists under another federated credential name, repair reuses it and removes the stale portal-named credential instead of attempting a duplicate create. Provider failures are recorded with an allow-listed safe summary and support reference. Owners and collaborators see only the safe status and support reference; raw provider diagnostics remain server-side or admin-only.

Repair does not delete repositories, dispatch deployment workflows, or delete Azure resources.

For an existing FastAPI app created before Oryx build automation was enabled, deploy the updated portal, run **Repair Publishing Setup**, and then publish or retry separately. Repair changes the Web App settings but intentionally does not dispatch the GitHub Actions workflow that causes Azure to build the Python environment.

After a failed deployment, the app details page offers both Retry Publish and Repair Publishing Setup. Retry starts a new deployment attempt and reconciles the portal-managed federated credential before dispatch. Repair refreshes setup without dispatching a workflow; publish or retry separately afterward.

If Microsoft Graph returns `Authorization_RequestDenied`, first check whether the configured Azure or Entra credential values expired or rotated. Update those values, then run repair for the affected app. If the current values are valid and Graph still denies writes, grant the portal runtime identity permission to update shared app registration redirect URIs and publisher app federated credentials.

## Local Development Flow

1. Install dependencies with `npm install`.
2. Start PostgreSQL with `npm run db:up`.
3. Apply the schema with `npm run prisma:migrate:deploy`.
4. Seed the template catalog with `npm run prisma:seed`.
5. Start the app with `npm run dev`.

## Verification

- `npm test`
- `npm run build`

### Repository import worker deployment

External GitHub repositories are mirrored by a dedicated Azure Container Apps Job, not by the portal App Service. Provision its ACR, Service Bus queue, identities, Key Vault, logs, and alerts from `infra/repository-import-worker/` after reviewing an Azure what-if. Populate the generated vault's `repository-import-database-url` and `github-app-private-key` secrets outside CI.

The `Deploy Repository Import Worker` workflow authenticates to Azure with GitHub OIDC, runs the full tests and Prisma validation, builds and smoke-tests one image, blocks on high or critical vulnerability findings, pushes only the commit-SHA tag, resolves its ACR content digest, and updates the job to `repository@sha256:...`. Configure repository variables `REPOSITORY_IMPORT_ACR_NAME` and `REPOSITORY_IMPORT_JOB_NAME`; reuse the existing Azure OIDC secrets used by portal deployment.

The portal App Service deployment remains independent: it neither installs Git nor builds or deploys the worker image. Production portal settings use `REPOSITORY_IMPORT_TRANSPORT=service-bus` plus the Bicep outputs `REPOSITORY_IMPORT_SERVICE_BUS_NAMESPACE` and `REPOSITORY_IMPORT_SERVICE_BUS_QUEUE`.

For local development, use `REPOSITORY_IMPORT_TRANSPORT=inline`; this invokes the same persisted-attempt runner in process and requires local Git. Never use inline mode in production. To stop new import dispatch during rollback, set `REPOSITORY_IMPORT_TRANSPORT=disabled`; requests receive a durable safe failure instead of running Git in App Service.

Promote only the SHA-tagged image that passed the offline container smoke test and vulnerability scan. The workflow resolves ACR's digest and deploys `repository@sha256:...`, never a mutable tag. Rotate `repository-import-database-url` or `github-app-private-key` by adding a new Key Vault secret version, validate a fresh job execution, and retain the previous version until the controlled smoke import succeeds.

The portal's public `GET /api/health` remains independent of the background worker. A healthy portal response proves the web control plane can serve requests; it does not prove Service Bus delivery, worker execution, Git availability, or repository mirroring.

### User documentation

The Markdown files in `docs/user/` are the source of truth for the portal Help pages and downloadable PDFs. After changing them, install `scripts/docs/requirements.txt`, run `npm run docs:pdf`, and commit the regenerated files in both `output/pdf/` and `public/docs/`. The PDF build fails if the Quick Start no longer fits on one US Letter page.

The Azure deployment package must include `docs/user/` because Help pages read those Markdown files at runtime. The deployment workflow copies that directory to `release/docs/user/` and verifies that `quick-start.md` exists before publishing the release.

For managed repo bootstrap verification, confirm the GitHub App is installed on the target org and then launch an app through CU Launch. A successful request should show a managed repository URL instead of a repository failure state.

## Notes

- The portal does not retain generated source archives; source is sent directly to GitHub during repository bootstrap.
- The Playwright onboarding flow uses a test-only auth bypass so entry routes, template selection, form focus, the generated create-to-wizard handoff, generated-starter resume, and My Apps routing can be exercised without Cedarville SSO. Generated form submission uses a narrowly scoped local repository-bootstrap substitute under that bypass, and the remaining fixture records are written directly to local PostgreSQL, so the suite does not call live GitHub or Azure providers. Request-specific publish and recovery branches remain covered by server-rendered page tests.

## Separate publishing worker

Start `npm run publish:worker` in a second terminal before requesting a local publish. Development defaults to durable database polling in that separate process. Production requires `PUBLISH_TRANSPORT=service-bus`, `PUBLISH_SERVICE_BUS_NAMESPACE`, and `PUBLISH_SERVICE_BUS_QUEUE`; it never falls back to an inline worker. Apply the new publishing-worker Prisma migration before deploying either component. See [publishing worker setup and recovery](publishing-worker.md).

## Managing an app's environment variables

The app management page supports drafting multiple environment variable changes before submission. Existing names stay in place while their values can be edited. Use **Add Variable** for additional rows, **Delete** to stage removal, and **Undo** to cancel a staged removal. **Save Changes** submits all edits; **Discard Changes** returns to the last saved values.

Saved secrets are never displayed. An empty replacement field keeps the existing secret unchanged. To change an existing variable's name or secret storage type, delete and save it first, then add its replacement.

The server checks app access and validates the entire submitted batch before mutations, preserves portal-managed settings, and updates live Azure app settings once per submission. Secret updates use Key Vault. Saving live settings briefly restarts the app. Draft edits remain available after errors; partial service failures can affect Azure, Key Vault, or database state because these systems do not share a transaction. Retrying a draft tolerates deletions already completed by a prior attempt.


### MCP ownership, admin reads, and logs

The MCP `list_my_apps` action returns owned apps only, including for admins. Separate portal ADMIN actions list all apps, inspect recorded diagnostics, find CU Launch users, and retrieve GitHub/Azure logs. These reads do not repair, retry, or deploy. Provider log access and logging availability require live verification; see [workspace plugin operations](codex-workspace-plugin.md) for schemas, limits, permission prerequisites, and rollout steps.


### MSAL security dependency override

The portal and both worker runtime manifests scope `@azure/msal-node` to version `7.1.0` under `@azure/identity` to address CVE-2026-109461. Keep all three lockfiles aligned; each Docker image installs its own worker runtime lockfile. This override crosses Azure Identity's declared MSAL range, so retain the offline credential compatibility tests and rebuild, smoke-test, and scan both Linux amd64 worker images before changing or removing it. Do not suppress the existing HIGH/CRITICAL image-scan gate.
