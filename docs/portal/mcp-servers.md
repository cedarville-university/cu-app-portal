# Advanced MCP servers

Implemented November 16, 2026. The `mcp-server` template remains **DISABLED** pending the [live pilot](mcp-server-pilot.md). Source implementation does not deploy the portal, activate the template, publish CU Launch's plugin, or create a user plugin.

## Template and tool authoring

`MCP Server (Advanced)` is a TypeScript/Next.js starter for Node.js 24 on CU Launch's existing Azure App Service path. It exposes Streamable HTTP at `/api/mcp`, public process health at `/api/health`, public OAuth resource discovery, and one harmless authenticated `get_server_info` tool. PostgreSQL is optional and defaults to no database; no OpenAI API key is required. Its locked SDK/transport uses stateless JSON responses, not long-lived event streams.

The catalog's audience policy is enforced in the UI, MCP creation adapter, and shared creation service. This template requires Cedarville authentication; existing templates retain both explicit audience choices. Every MCP dispatch needs a delegated token minted for this server. Browser sessions, app-only tokens, and CU Launch control-plane tokens cannot substitute.

Add tools in `src/mcp/server.ts` or focused modules. Use the validated immutable principal, strict schemas, accurate effects, and server-side record/action authorization. Do not accept caller identity as tool input or forward an incoming token to an upstream API. Downstream delegation/OBO is a separate integration. Honor cancellation when adding upstream calls. Requests are bounded at 256 KiB, 20 seconds, and 60/minute per principal per process; the last limit is not a distributed quota. Keep tokens, credentials, raw arguments, and results out of logs.

## Identity and operator setup

Apply migration `20261116160000_add_app_mcp_configuration` before this portal/worker version. The new per-app record retains stable resource IDs and historical deployment probes. A fenced two-minute lease serializes setup; identifiers are persisted before dependent provider steps so interrupted reconciliation can recover.

Each server has a single-tenant Entra resource application with v2 tokens and admin delegated scope `mcp.access`. Reconciliation validates an ownership marker and deterministic name. It never changes the shared browser-login application, grants consent, assigns users/groups, creates client secrets, or broadens directory permissions. Ambiguous, missing recorded, or mismatched resources require operator action.

| Operator setting | Meaning |
| --- | --- |
| `AZURE_PUBLISH_MCP_AUTOMATION_ENABLED` | Keep unset/false before the approved pilot. `true` allows owned resource reconciliation during an authorized publish/repair, but does not activate the template. |
| `AZURE_PUBLISH_MCP_CLIENT_IDS` | Comma-separated verified host OAuth client IDs. All listed clients must already be preauthorized for the resource scope before READY. No secrets. |

Validate actual Graph operations with an approved least-privilege permission set before enabling reconciliation; `Application.ReadWrite.OwnedBy` is a proposed starting point, not proof of existing access. [Microsoft Graph permission guidance](https://learn.microsoft.com/en-us/graph/api/application-post-applications?view=graph-rest-1.0) governs the operator review. No permission or consent grants are implemented here.

An operator-prepared resource can be discovered instead of created. Use application display name `cu-mcp-` followed by the first 24 SHA-256 hexadecimal characters of `cu-launch-mcp:<requestId>`, and set `notes` to that full ownership string. Configure the exact managed endpoint Application ID URI, v2 tokens, `AzureADMyOrg`, and an enabled admin delegated `mcp.access` scope. Prepare its service principal and client enrollment before repair. The adapter validates existing configuration rather than rewriting drifted identities. Do not enter resource IDs via ordinary environment settings.

The operator must preauthorize approved clients/scopes, configure their exact supported callbacks/PKCE/token authentication, and exclude external guests through enterprise admission. Service principals are created with `appRoleAssignmentRequired: true`; assign intended Cedarville members/groups before login. READY checks that setting and configured client preauthorization, but does not prove assigned group contents, MFA/consent, or host login. Verify those in the pilot.

Six reserved runtime settings are supplied by CU Launch: `MCP_RESOURCE_URL`, `MCP_ENTRA_TENANT_ID`, `MCP_ENTRA_ISSUER`, `MCP_ENTRA_AUDIENCE`, `MCP_ENTRA_SCOPE`, and `MCP_ALLOWED_ORIGINS`. UI and plugin ordinary environment writes reject these keys. The exact token audience is the resource application's client ID, distinct from the HTTPS resource URL. No resource-server client secret is required. Missing identity settings yield sanitized 503 for MCP/discovery while health stays 200.

The resource uses the managed Azure hostname. If tenant policy or a host rejects that identifier URI, keep the template disabled and revise the resource/domain design. Custom-domain migration, a custom OAuth broker, and anonymous fallback are not included.

## Publishing and evidence

Use ordinary launch, customize, and separately requested first publish. Creation never deploys. Identity setup precedes runtime settings; unresolved client enrollment blocks a usable publish. Repair preserves IDs and dispatches no deployment. Normal saved push-to-deploy behavior applies after the first publish.

The MCP deployment probe requires exact health 200, matching discovery, and an unauthenticated 401 bearer challenge, without logging in or calling tools. During startup it makes up to six attempts for network failures, 404, or 5xx, with a five-second delay between attempts and a ten-second timeout per request. Identity mismatches, redirects, and anonymous access fail immediately. `get_app.mcp` and the accessible details card return nonsecret connection data after identity READY and successful publishing. Probe status/attempt/time are `HISTORICAL_ONLY`: independent default-branch pushes are not reconciled automatically. Unknown commit SHA is null. Interrupted and terminal-state publish recovery use the same app-specific MCP verifier. Current client verification is always REQUIRED.

Report repository readiness, Azure deployment, authenticated host connection, plugin save/update, and post-install harmless call separately. Health or package creation proves neither OAuth nor tool access.

## Plugin Creator integration

Read Plugin Creator's installed **existing MCP server** and package instructions. Use CU Launch's actual Azure endpoint and preserve its hosting. The CU Launch workspace skill includes `references/mcp-server-plugin-creator.md`; no Sites calls or curated Plugin Creator edits are required.

Pass the accessible app ID/support reference, actual endpoint/transport/metadata URL, issuer/full scope, recorded deployment evidence, and actual tool discovery or its pending state. For an existing plugin, resolve its exact eligible ID and preserve identity/sharing. Never substitute CU Launch's control-plane endpoint, invent App IDs, or archive credentials/server dependencies.

[Official OpenAI package guidance](https://developers.openai.com/plugins/build/plugins#configure-mcp-authentication) documents portable `mcp.json` and per-server `extensions.com.openai.auth`, including predefined OAuth clients (`client.mode: "provided"`). Use only verified values from the operator-tested host recipe and the current installed Plugin Creator instructions. Secrets belong in secure host connection setup, never manifests.

If installation must precede OAuth, save the authorized endpoint-based package with authentication/discovery pending, then connect, discover real schemas, and verify `get_server_info`. A blocked connection preserves the server/plugin; it does not justify Sites or a duplicate plugin. Sharing requires a separate request and never grants server data permissions.

## Recovery and deletion

Preflight compares reserved identity settings against Azure; missing registration/enrollment requires operator action. Repair cannot replace resource identity or grant consent. The Azure deletion scope also deletes the marked resource application and its home-tenant service principal. Ownership mismatch stops deletion; shared clients are untouched. Portal-only deletion is blocked while an owned application ID remains, preserving ownership evidence until identity/Azure removal.

Rollback new availability by restoring catalog DISABLED and reverting the managed plugin release if needed. Retain existing servers and identities for investigation; deletion is a separate explicitly scoped action.

Owned identity removal is fenced by the setup lease. Successful provider removal retires the stored IDs (`REMOVED`), making later portal-only cleanup possible; failed removal preserves the IDs for retry. A removed identity is not silently recreated by repair. First publish/repair saves Azure cleanup targets before suspending for operator client enrollment.

## Optional PostgreSQL

When selected at creation, CU Launch uses its existing per-app PostgreSQL provisioning and stores DATABASE_URL through Key Vault during publish and repair. The generated app includes pinned Prisma dependencies, a server-only `src/lib/db.ts` client, and an initial AppSetting migration. `npm run db:migrate -- --name your_change` supports local schema work; production startup runs `prisma migrate deploy`. The default no-database variant omits the Prisma files/dependencies and database environment setting. Both variants have separate pinned lockfiles.

The plugin preserves the selected database mode in the launch summary and uses `databaseProvider: "postgresql"` only when chosen. Existing-server handoffs report a storage mode only when verified. Connection strings and credentials never belong in Plugin Creator packages or chat. Tool authors must enforce each caller’s row/action permissions, and keep health/discovery independent of database queries.
