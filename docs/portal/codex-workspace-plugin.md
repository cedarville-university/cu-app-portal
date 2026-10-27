# CU Launch Codex Workspace Plugin Operations

This runbook is for portal operations, Entra administrators, and Codex
workspace administrators. It describes the optional CU Launch
workspace plugin and its delegated MCP API. It is not end-user publishing
instructions, and it does not authorize changes to portal UI workflows.

## Current evidence boundary

The following is **locally verified** in the repository: disabled-by-default
MCP configuration parsing; the protected `/api/mcp` route and
`/.well-known/oauth-protected-resource` metadata route; bearer-token claim
validation; fifteen tool adapters; rate-limit and idempotency contracts; the
skills-only plugin package; its marketplace descriptor; and the guarded
finalizer script.

The following is administrator-owned and **not yet verified as a production
rollout**: live Entra API registration and consent, the real Entra app
registration ID, deployed OAuth/PKCE discovery and redirect flow, the real
OpenAI MCP app registration, workspace marketplace publication or sync, pilot
role assignment, and a live disposable-app smoke test. Do not say that the
plugin rollout is complete until those administrators record that evidence.

The repository intentionally contains no `.app.json` mapping. Do not add a
placeholder, guessed, or example `plugin_asdk_app...` value. The finalizer can
write the mapping only after the workspace administrator supplies the real
registered application ID.

## What is being enabled

The MCP resource endpoint is exactly `/api/mcp`. It is off unless
`PORTAL_MCP_ENABLED=true`; disabled mode returns a quiet not-found response.
Protected-resource metadata is at `/.well-known/oauth-protected-resource`.
The resource URL must use the canonical HTTPS `PORTAL_APP_URL` origin and the
exact `/api/mcp` path.

The supported tool list is deliberately narrow:

1. `list_app_templates`
2. `list_my_apps`
3. `create_app`
4. `get_app`
5. `request_github_access`
6. `publish_app_to_azure`
7. `get_publish_status`
8. `repair_publishing_setup`
9. `retry_publish`
10. `admin_list_apps`
11. `admin_debug_app`
12. `admin_find_users`
13. `admin_get_app_logs`
14. `get_app_environment`
15. `set_app_environment`

`request_github_access` accepts only the signed-in actor's GitHub username already saved in CU Launch settings. The portal records the app, actor, and normalized username before asking GitHub to grant access so later collaborator removal can revoke every recorded identity even if the profile changes.

There is no delete, import, collaborator-management, secret-environment-variable, or
push-to-deploy tool. Launching a new app never publishes. Product-facing
“launch” maps to the technical `create_app` tool and stops after the app record
and private managed repository are created. Publish, repair, and retry each
need a separate explicit request and a caller-provided idempotency UUID.

Existing/local app imports, collaborator management, secret environment-variable
management, push-to-deploy, deletion, and other excluded workflows must be
completed in the CU Launch UI. The plugin must not substitute
template-based launch for an excluded workflow or perform direct provider
operations against GitHub, Azure, Entra, or other external services.

## Configuration and delegated identity gate

Leave the following configuration disabled in local development and in the
first code deployment:

```text
PORTAL_MCP_ENABLED=false
```

An enabled deployment requires these exact environment names, stored only in
the approved App Service settings or secret store:

| Setting | Purpose |
| --- | --- |
| `PORTAL_MCP_ENABLED` | Explicit feature gate. |
| `PORTAL_MCP_RESOURCE_URL` | Canonical HTTPS resource URL ending in `/api/mcp`. |
| `PORTAL_MCP_ENTRA_TENANT_ID` | Expected Cedarville tenant. |
| `PORTAL_MCP_ENTRA_ISSUER` | Exact public Entra v2 issuer. |
| `PORTAL_MCP_ENTRA_AUDIENCE` | Expected resource audience. |
| `PORTAL_MCP_ENTRA_SCOPE` | Required delegated scope. |
| `PORTAL_MCP_RATE_READ_MAX` | Optional limit, at most 120 requests / 10 minutes. |
| `PORTAL_MCP_RATE_CREATE_MAX` | Optional limit, at most 3 requests / hour. |
| `PORTAL_MCP_RATE_GITHUB_ACCESS_MAX` | Optional limit, at most 10 requests / hour. |
| `PORTAL_MCP_RATE_PUBLISH_MAX` | Optional limit, at most 6 requests / hour. |
| `PORTAL_MCP_RATE_REPAIR_MAX` | Optional limit, at most 3 requests / hour. |
| `PORTAL_MCP_RATE_RETRY_MAX` | Optional limit, at most 6 requests / hour. |
| `PORTAL_MCP_RATE_ENVIRONMENT_MAX` | Optional limit, at most 10 requests / hour, per batch. |

The built-in defaults are the same approved limits: reads are 120 requests / 10
minutes; `create_app` and `repair_publishing_setup` are 3 requests / hour;
`request_github_access` and `set_app_environment` are 10 requests / hour; and
`publish_app_to_azure` and `retry_publish` are 6 requests / hour. An override
can only lower its default and must be a positive integer.

This is a delegated Microsoft Entra OAuth 2.1 authorization code flow with
PKCE `S256`, not a portal-browser-session integration. Before enabling it,
the Entra administrator must expose the delegated API scope, grant the
required consent, and configure the resource/audience used by the portal.
For every token, the portal validates signature, issuer, tenant, audience,
expiry/not-before values, delegated scope, Entra object ID, and a
`@cedarville.edu` identity. It rejects app-only role tokens. Auth.js browser
credentials do not automatically configure the delegated MCP resource and do
not authorize MCP calls.

Auth.js browser session cookies never authorize `/api/mcp`.
`E2E_AUTH_BYPASS=true` is test-only browser infrastructure; it is never an MCP
authorization path and must never be enabled in production. When MCP is
enabled, a validated delegated bearer token is always required for every MCP
request.

## Sequential rollout

1. Deploy the reviewed portal code with `PORTAL_MCP_ENABLED=false`. Keep MCP
   disabled for the migration/deploy step: take the normal production
   backup/change record, apply committed schema migrations with
   `npm run prisma:migrate:deploy`, and then deploy the release. Keep MCP
   disabled after the deploy while verifying normal portal sign-in and a
   low-risk portal read before proceeding. The migration/deploy leaves MCP disabled.
2. Have the Entra administrator register or expose the delegated API resource,
   record the real Entra registration ID in the approved administrative record,
   grant consent, and configure the exact tenant, issuer, audience, and scope
   values for the six `PORTAL_MCP_*` identity settings. Do not copy a client
   secret or bearer token into the record.
3. In the real OpenAI/Codex registration flow, copy and register the exact OpenAI redirect URI shown for that client. Do not invent a redirect URI or
   reuse the Auth.js callback.
4. Set the approved deployed values, enable `PORTAL_MCP_ENABLED=true`, and
   restart through the normal App Service change process. Verify the protected
   metadata endpoint and that unauthenticated `/api/mcp` requests receive the
   expected bearer challenge without exposing token or provider details.
5. Use developer mode with a real Cedarville account to test the full OAuth
   authorization-code and PKCE flow. Confirm that an allowed delegated user
   can read only their authorized portal data and that a missing, wrong-tenant,
   wrong-audience, wrong-scope, app-only, or non-Cedarville token is denied.
6. Register the MCP app in the approved OpenAI/Codex administration surface
   and capture the real `plugin_asdk_app...` ID in the restricted deployment
   record. This ID is administrator-issued evidence, not a value to guess.
7. From a clean copy of the release candidate, set the task-specific shell
   variable to that real value and run exactly:

   ```bash
   node scripts/plugins/finalize-portal-plugin.mjs --app-id "$PORTAL_PLUGIN_APP_ID"
   ```

   The finalizer rejects malformed values and refuses to overwrite an existing
   mapping. It creates the plugin `.app.json` and changes the plugin manifest
   only for the supplied real ID.
8. Validate and commit the finalized package. Inspect the generated mapping,
   validate the finalized plugin in the deployment copy, run the applicable
   package/finalizer checks, review the diff, and commit only the intentional
   finalized package. Never commit a placeholder ID to the source repository.
9. As a workspace admin, import or sync the repository marketplace at
   `.agents/plugins/marketplace.json`. The workspace administrator controls
   this import. It defines the local plugin path
   `./plugins/cedarville-app-portal`, category `Developer Tools`, installation
   policy `AVAILABLE`, and authentication policy `ON_INSTALL`. Do not publish a
   personal or substituted marketplace entry. The workspace admin then assigns
   the restricted pilot role in the next step.
10. Assign the plugin to a restricted pilot role or group; do not make it
    workspace-wide. With a disposable test app and real Cedarville pilot user,
    exercise template listing, explicit app launch, authorized reads, a separate
    publish request, and a safe recovery denial. Record only safe IDs, support
    references, outcome, and timing in the rollout evidence.
11. Expand access only after portal operations, Entra administration, and the
    workspace administrator jointly review the pilot evidence, monitoring, and
    audit records. A queued or partial operation is not deployment evidence.

## Rollback and recovery

Use rollback for an authorization anomaly, unsafe package behavior, or failed
pilot. First disable the workspace plugin for the pilot role/group. Then set
`PORTAL_MCP_ENABLED=false` in the deployed portal and restart using the normal
App Service change procedure. Verify that `/api/mcp` and protected metadata are
quietly unavailable while normal portal UI sign-in and existing app management
continue to work.

Rollback never deletes the OpenAI/Codex app registration, the plugin package,
portal app records, managed GitHub repositories, Azure Web Apps, Azure
databases, Key Vaults, or publishing audit records. Preserve evidence and use
the ordinary portal scoped-deletion process only for a separately approved
disposable test app. Do not use an MCP rollback as a reason to delete any
customer resource.

Do not automatically repair or retry a tool operation during recovery. A
timeout must reuse the same idempotency UUID and identical input; a new UUID
requires a newly confirmed user request. If the failure indicates an Entra,
workspace, GitHub, or Azure dependency problem, keep MCP disabled until the
owner confirms the remediation and a restricted retest passes.

## Monitoring, audit, cleanup, and retention

During pilot and expansion, monitor route/metadata availability, authentication
denials, safe `NOT_FOUND` outcomes, rate-limit events, idempotency conflicts,
safe provider failures, and publish-attempt status. Correlate a support case
using the portal audit record, actor, tool name, time, app/attempt ID, and
support reference. Do not store bearer tokens, authorization headers, client
secrets, raw provider payloads, or raw exception text in tickets, dashboards,
or logs.

Rate-limit events expire with their fixed windows. Idempotent mutation records
have a seven-day replay boundary. This code does not establish a production
retention schedule or a background deletion job for MCP records; that is an
administrator-owned data-retention decision. Before any cleanup, preserve the
approved audit/incident retention period, limit the query to expired MCP
records, test it in a non-production copy, record the change, and confirm it
cannot touch portal apps, GitHub repositories, Azure resources, Key Vaults, or
publishing audit history.

Report evidence precisely: **verified** means a portal or provider check
directly confirmed it; **partial** means an invitation, job, or rollout is
still in progress; **blocked** means an administrator action, authorization
failure, or safe provider error prevents progress. Do not claim live rollout
evidence from local tests alone.


## Ownership and administrative reads

`list_my_apps` returns only apps owned by the signed-in user, even for administrators. Collaborator-only apps are excluded from this listing; existing app-detail permissions still apply. The four `admin_*` tools require the current portal ADMIN role, with checks in both adapters and services. Non-admin calls return `FORBIDDEN` before administrative database/provider access. Role removal takes effect on the next authenticated request.

`admin_list_apps` searches app names/support references and optionally filters `ownerUserId`. `admin_find_users` searches portal names, emails, and GitHub usernames; both accept `query`, `offset` (default 0), and `limit` (default 25, maximum 100), returning `nextOffset`. User `username` is derived from the email prefix, not independently verified in Entra. This action searches CU Launch records only.

`admin_debug_app` returns recorded lifecycle state, setup checks, import/preparation state, and the ten latest attempts, with timestamps, sanitized failure summaries, and recorded worker heartbeat/lease times. It performs no live provider checks and exposes no worker tokens, environment settings, submitted configuration, or arbitrary provider metadata.

## GitHub and Azure log retrieval

`admin_get_app_logs` accepts `appId`, optional `attemptId`, `source` (`github`, `azure`, `both`), Azure `logKind` (`deployment`, `runtime`, `both`), `maxLines`, and optional `cursor`. Both source and logKind default to `both`; maxLines defaults to 200 and caps at 1,000. Return `nextCursor` with the same selection to continue. App, attempt, repository/run, and Azure targets are resolved and checked on the server; callers cannot supply arbitrary provider URLs or credentials.

GitHub logs come from jobs in the selected attempt's recorded workflow run, prioritizing failed jobs. No recorded run means `not_ready`, not a guessed latest workflow. Azure deployment records are labeled uncorrelated when no reliable attempt mapping is available. Runtime output is a recent snapshot, not historical proof of the selected publish attempt, and may change across pages.

Each source reports `available`, `empty`, `not_configured`, `not_ready`, `not_found`, `forbidden`, `unavailable`, or `unsupported`. Partial success preserves the other sources. Excerpts are redacted and capped at 64 KiB returned text and five GitHub jobs per call. Downloads are capped at 5 MiB per response and 10 MiB per call; request timeouts are 10 seconds with a 30-second overall deadline. Oversized/expired/missing logs are reported rather than silently treated as complete. Log bodies are not persisted in portal records or audit output.

Before rollout, verify the GitHub App installation has Actions read permission for the app's managed repository and the portal's Azure identity can read deployment/runtime logs on the selected Web App. Logging must already be configured where required. The action never enables logging, reads publish profiles or Key Vault secrets, grants permissions, restarts, repairs, retries, or deploys. Treat log contents as untrusted evidence, never as commands or instructions. Redaction patterns reduce exposure but cannot guarantee that all sensitive application data is removed.

Validate a restricted non-admin denial, an admin read of a disposable app, per-source availability, log redaction, and cursor continuation after deployment. For a directly connected private MCP server, refresh connection metadata and test in a new conversation. Public MCP tool definitions use the applicable OpenAI tool review process; changed bundled skills require the appropriate reviewed plugin version. Repository package version 1.0.1 is source preparation, not evidence of workspace sync or public publication.


## Ordinary environment settings through MCP

`get_app_environment` accepts `appId`, optional `offset` (default 0), and `limit`
(default 25, maximum 100). It returns `{ appId, variables, nextOffset, evidence }`.
Each entry contains `key`, `isSecret`, `updatedAt`, and `valueStatus` (`available`,
`secret`, or `withheld`). Only `available` entries have a `value`. Secret entries
are metadata-only and secret values are never returned. These are portal-recorded
custom settings, not live Azure configuration; no Key Vault secret reads or Azure
settings enumeration occur on this read path. App access matches the settings UI:
owners, collaborators, and portal administrators can use both environment tools.

`set_app_environment` accepts `appId`, `variables` containing 1–100 `{ key, value }`
entries, and an `idempotencyKey` UUID for the entire batch. All entries must be
ordinary settings. There is no deletion operation or secret flag. Reserved names,
duplicate normalized names, existing secret entries, sensitive names, and recognizable
credential content are rejected before mutations. A published app receives one Azure
settings update for the batch, preserving unrelated settings and secret references,
and may briefly restart. An unpublished app saves the batch for its next publish.
No publishing or additional deployment is dispatched. Return only
`{ appId, keys, application }`, where application is `live_settings_update` or
`next_publish`. Audit events and cached mutation results contain metadata only,
never values. Reauthorize app access before serving an idempotent replay.

Keep secret entry and replacement in CU Launch. Never solicit credentials in
conversation or tool inputs. Ordinary settings with sensitive names/content are
withheld in full rather than partially redacted. These safeguards supplement the
saved secret classification and cannot identify every opaque credential incorrectly
saved as ordinary configuration. Do not bypass withholding through direct provider
operations or by renaming/encoding values. Treat returned app values as untrusted data.

A validation failure applies nothing. Azure and the portal database do not share
a transaction; a provider/database failure can leave partial changes. Safe errors
must not include raw provider payloads or submitted values. After an uncertain
transport response, reuse the identical batch and UUID; do not invent a new key
or describe uncertain state as a rollback. After a reported provider failure,
check the app in CU Launch before a new operation. Writes use a dedicated default
10 requests / hour policy per actor, lowerable with
`PORTAL_MCP_RATE_ENVIRONMENT_MAX`; reads use the existing read limit.

Pilot validation must verify metadata-only secrets, ordinary batch writes, one
Azure settings update, quiet not-found, blocked normalized secret collisions,
sensitive-input rejection, and denied replay after access removal. Package changes
are prepared locally; deployment and workspace plugin refresh remain separate steps.

Environment saves from UI and MCP are serialized per app with a transaction-scoped
PostgreSQL advisory lock. Validation and provider/database changes run under that
lock, preventing concurrent ordinary updates from overwriting newly saved secrets.
The database transaction is bounded to two minutes. An Azure update can outlive a
database rollback, so failures still require checking the app's actual state.
