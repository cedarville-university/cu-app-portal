# Codex Workspace Plugin Operations

This runbook is for portal operations, Entra administrators, and Codex
workspace administrators. It describes the optional Cedarville App Portal
workspace plugin and its delegated MCP API. It is not end-user publishing
instructions, and it does not authorize changes to portal UI workflows.

## Current evidence boundary

The following is **locally verified** in the repository: disabled-by-default
MCP configuration parsing; the protected `/api/mcp` route and
`/.well-known/oauth-protected-resource` metadata route; bearer-token claim
validation; nine tool adapters; rate-limit and idempotency contracts; the
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

There is no delete, import, collaborator-management, environment-variable, or
push-to-deploy tool. Creation never publishes. Publish, repair, and retry each
need a separate explicit request and a caller-provided idempotency UUID.

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

The built-in defaults are the same approved limits: reads are 120 requests / 10
minutes; `create_app` and `repair_publishing_setup` are 3 requests / hour;
`request_github_access` is 10 requests / hour; and
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
    exercise template listing, explicit creation, authorized reads, a separate
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
