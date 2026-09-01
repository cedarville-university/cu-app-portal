# Portal Setup

This guide explains local development, required environment variables, and database setup for the Cedarville App Portal.

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

The home page routes **Create New App** and **Add Existing App** through the initial onboarding wizard. New-app users are told that template selection is next. Existing-app users receive separate **Already on GitHub** and **Only on my computer** routes, with the selected form identified by the query string and heading (the local route also uses `#local-app`). After a repository is created or imported, the user enters a focused setup sequence for GitHub access, optional Codex handoff, repository preparation, and an explicitly requested first Azure publish.

Template creation never publishes automatically. The generated-app form requires the user to choose Cedarville sign-in or openly public access; an openly public choice requires acknowledgement that anyone who knows or discovers the address can use the app. After creation, **Publish the starter now** starts Azure publishing immediately and is the only publish confirmation for an unchanged generated starter. **Customize it with Codex first** takes the user through GitHub access, customization, and setup before a later **Publish to Azure** action. Users who customize or upload local code are first asked whether they have a GitHub account. Account creation guidance explains that the username is chosen during signup and appears after `github.com/` in the profile address before the portal displays the username form. Imported apps are prepared only after the user requests it; publishing-file conflicts use a pull request for review instead of overwriting files. Local apps use a Codex-owned upload flow and must not advance until the user selects **My code has been uploaded** after Codex confirms the push.

A saved GitHub username or legacy repository-access status does not skip the generated starter-or-customize choice. The unchanged starter path does not require GitHub or Codex. Only the customization, local upload, and imported-repository conflict paths evaluate access for the current signed-in actor; actor-specific invite, grant, and failure results are stored in append-only audit events so concurrent collaborators do not share a last-writer status.

The onboarding page auto-refreshes while repository creation, preparation, publishing setup, or publishing is in progress. Recovery stays in the focused wizard: preparation can be retried with the saved method, unsupported local apps return to Codex repair, and failed setup offers **Fix publishing setup** without dispatching a deployment. For customized generated apps and imported or local apps, **Publish to Azure** is the separate confirmation shown after preparation and setup; it is not a second confirmation after **Publish the starter now**. After a successful publish, onboarding offers a direct live-app link as well as the full details page. My Apps sends every unpublished request to **Continue Setup** and every successfully published request to **Manage App**. The details page shows a readiness summary and portal-sharing controls first; repository, Codex, environment-variable, and publishing diagnostics are collapsed under **Advanced options**.

Generated managed repositories use a stable request-unique target name plus a request ownership marker. Repository recovery treats a name collision as unowned unless the existing remote carries the exact request marker. An owned partial repository is completed from its existing tree, and the default branch advances only when its head still matches the head read for that attempt. Duplicate retry submissions and duplicate publishing-setup repair submissions are atomically claimed before any provider mutation.

The add-existing-app flow uses the same GitHub App configuration as portal-managed repository creation. In V1, the portal accepts repositories it can read through the configured GitHub App installation or through public GitHub access; there is no user GitHub OAuth or personal access token access in V1.

When a submitted repository is outside `GITHUB_DEFAULT_ORG`, the portal imports it into the default org with a short-lived GitHub App installation token and preserves the source repository history. The GitHub App needs repository creation permission in the target org, plus read access to private source repositories that are imported.

If a user has built an app locally with Codex but has not created any GitHub repository yet, the portal creates the destination repository directly in `GITHUB_DEFAULT_ORG` with only the canonical `.codex/skills/cu-app-portal/SKILL.md` guidance in its first commit. The onboarding prompt initializes the local folder if needed, preserves existing history and remotes, adds a verified managed remote, and pulls that guidance commit before app changes. For an unrelated existing history, Codex uses a non-rebase pull that preserves both histories and stops rather than overwriting a conflict. The pulled skill owns framework recognition and the smallest safe migration to a supported root Next.js, Express, FastAPI, or static app before tests and upload. GitHub CLI (`gh`) is not required for this path.

Customization and local-upload handoffs require a **local Codex project** before the prompt is used. For generated apps, the user creates a new empty folder and makes it the project's primary folder; for local apps, the existing app folder becomes primary. Portal copy must explicitly say not to use Quick chat or a standalone task outside that project. Git is supplied through Cedarville-managed software: **Company Portal** on Windows and **CedarNet 2.0** on macOS. After installing Git, the user completely quits and reopens Codex. The prompt runs `git --version` first and, when Git is missing, must stop and provide those managed-install steps; it must not attempt an installation. GitHub operations use HTTPS and secure browser or operating-system sign-in. Prompts must not ask for passwords, personal access tokens, SSH keys, portal credentials, or other secrets, and must not fall back to GitHub CLI or the GitHub plugin.

V1 supports root Next.js apps, Express apps, Python FastAPI apps, and plain static Python `http.server` apps with a root `index.html` for Azure App Service publishing. After import or scan, the portal prepares the repository for the matching supported Azure App Service publishing path. Express and static `http.server` imports do not add PostgreSQL or Microsoft Entra login; use a generated template when an app needs those options.

### Portal-Managed Azure Publishing

To enable portal-managed Azure publishing for generated user apps, configure the portal with the shared Azure publish target and generated-app auth settings:

- `AZURE_PUBLISH_RESOURCE_GROUP=rg-cu-apps-published`
- `AZURE_PUBLISH_APP_SERVICE_PLAN=asp-cu-apps-published`
- `AZURE_PUBLISH_POSTGRES_SERVER=psql-cu-apps-published`
- `AZURE_PUBLISH_POSTGRES_ADMIN_USER`
- `AZURE_PUBLISH_POSTGRES_ADMIN_PASSWORD`
- `AZURE_PUBLISH_LOCATION`
- `AZURE_PUBLISH_RUNTIME_STACK=NODE|24-lts`
- `AZURE_PUBLISH_CLIENT_ID`
- `AZURE_PUBLISH_TENANT_ID`
- `AZURE_PUBLISH_SUBSCRIPTION_ID`
- `AZURE_PUBLISH_AUTH_SECRET`
- `AZURE_PUBLISH_ENTRA_CLIENT_ID`
- `AZURE_PUBLISH_ENTRA_CLIENT_SECRET`
- `AZURE_PUBLISH_ENTRA_ISSUER`
- `AZURE_PUBLISH_ENTRA_APP_OBJECT_ID`

Current v1 design decisions:

- Generated user apps share one Azure resource group: `rg-cu-apps-published`.
- Generated user apps share one App Service Plan: `asp-cu-apps-published`.
- Generated user apps share one PostgreSQL flexible server: `psql-cu-apps-published`.
- Each published app gets its own Azure Web App. When PostgreSQL is selected for that app, it also gets its own PostgreSQL database on the shared server.
- `AZURE_PUBLISH_RUNTIME_STACK=NODE|24-lts` remains the current default for the legacy/imported Node publishing path.
- Runtime-specific generated templates and prepared imported apps carry their App Service runtime stack in the deployment manifest. The portal-managed publisher uses that runtime when creating the Web App.
- FastAPI Web Apps use Azure App Service build automation: `SCM_DO_BUILD_DURING_DEPLOYMENT=true` and `ENABLE_ORYX_BUILD=true`. The portal removes `WEBSITE_RUN_FROM_PACKAGE` for FastAPI because Python App Service does not support that mode. Generated and prepared FastAPI workflows deploy source, and Oryx installs dependencies from the root `requirements.txt` or supported `pyproject.toml` configuration.
- Database and auth publishing are conditional based on the selected template or imported app features. Apps that do not select PostgreSQL skip per-app database setup, and apps that do not select Microsoft Entra login skip auth settings and redirect URI setup.
- The create flow groups catalog choices into Recommended Templates for common non-technical app shapes and Developer Starters for lower-level runtime-oriented starts. Some recommended presets reuse the shared Next.js source while applying stricter database defaults; every active generated template still requires an explicit Cedarville-sign-in or openly-public audience choice.

Deletion behavior:

- `My Apps` deletion is scoped. Users can delete the portal record, the managed GitHub repository, and the Azure deployment independently.
- Azure deletion removes the selected app's Azure Web App and, if one was provisioned, the selected app's PostgreSQL database on the shared server.
- Azure deletion never deletes the shared PostgreSQL flexible server.
- If a user leaves GitHub or Azure unchecked while deleting the portal record, those resources must be deleted manually later because the portal record will no longer appear in `My Apps`.

### Azure Permissions for App Env Vars and Secrets

User-managed environment variables store secret values in one Key Vault per
published app (`kv-{slug}-{shortRequestId}` in the publish resource group).
Secrets reach the running app through Key Vault references resolved by the
web app's system-assigned managed identity.

The portal's publishing service principal (`AZURE_PUBLISH_CLIENT_ID`) needs,
scoped to the publish resource group:

1. **Contributor** (already required for publishing) — creates/deletes
   vaults and enables web app managed identities.
2. **Key Vault Secrets Officer** — sets and deletes secret values in the
   RBAC-mode vaults.
3. **Role Based Access Control Administrator** — grants each web app's
   managed identity `Key Vault Secrets User` on its own vault. Constrain it
   with an ABAC condition so it can only assign that one role.

```bash
az role assignment create \
  --assignee "$AZURE_PUBLISH_CLIENT_ID" \
  --role "Key Vault Secrets Officer" \
  --scope "/subscriptions/$SUB_ID/resourceGroups/rg-cu-apps-published"

az role assignment create \
  --assignee "$AZURE_PUBLISH_CLIENT_ID" \
  --role "Role Based Access Control Administrator" \
  --scope "/subscriptions/$SUB_ID/resourceGroups/rg-cu-apps-published" \
  --condition "((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6})) AND ((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6}))" \
  --condition-version "2.0"
```

Deleted vaults soft-delete for 90 days; the portal never purges them.

### Admin And Collaboration Permissions

- Each app has one primary owner.
- Admins can see all users and apps, manage admin roles, reassign owners, manage collaborators, and delete scoped app resources.
- App owners and admins can remove accepted collaborators from the app details screen.
- Collaborators can view app details, request GitHub repository access for themselves, repair publishing setup, and publish app changes.
- Collaborators cannot delete app resources or reassign ownership.

### Notifications And Collaboration Invites

Set `PORTAL_APP_URL` to the public portal origin used in email links. Configure SMTP with `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS_MODE`, `SMTP_FROM`, and optional username, password, and reply-to values.

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

### User documentation

The Markdown files in `docs/user/` are the source of truth for the portal Help pages and downloadable PDFs. After changing them, install `scripts/docs/requirements.txt`, run `npm run docs:pdf`, and commit the regenerated files in both `output/pdf/` and `public/docs/`. The PDF build fails if the Quick Start no longer fits on one US Letter page.

The Azure deployment package must include `docs/user/` because Help pages read those Markdown files at runtime. The deployment workflow copies that directory to `release/docs/user/` and verifies that `quick-start.md` exists before publishing the release.

For managed repo bootstrap verification, confirm the GitHub App is installed on the target org and then create an app through the portal. A successful request should show a managed repository URL instead of a repository failure state.

## Notes

- The portal does not retain generated source archives; source is sent directly to GitHub during repository bootstrap.
- The Playwright onboarding flow uses a test-only auth bypass so entry routes, template selection, form focus, the generated create-to-wizard handoff, generated-starter resume, and My Apps routing can be exercised without Cedarville SSO. Generated form submission uses a narrowly scoped local repository-bootstrap substitute under that bypass, and the remaining fixture records are written directly to local PostgreSQL, so the suite does not call live GitHub or Azure providers. Request-specific publish and recovery branches remain covered by server-rendered page tests.
