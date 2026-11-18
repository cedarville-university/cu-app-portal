# MCP server live pilot

Status November 17, 2026: **Both isolated MCP servers published; private Plugin Creator save/update, native ChatGPT Work and Codex calls, and PostgreSQL persistence passed. Guest/two-user admission, prompted MFA/consent, native refresh, and representative publishing-identity checks remain. The user accepted these checks as sufficient and explicitly approved production rollout; remaining checks are recorded limitations, not activation blockers. See the [production rollout record](mcp-server-production-rollout-2026-11-17.md).** The [isolated portal testing deployment](mcp-server-testing-deployment-2026-11-16.md) verifies the portal form and portal sign-in. The separate [live pilot record](mcp-server-live-pilot-2026-11-17.md) records exact resources, successful workflows, the startup-probe repair, scoped access removal, and remaining verification.

Local evidence covers the locked SDK 1.30.0, jose 6.2.10, zod 3.25.76, and Next.js 15.5.19; real locally signed JWTs; SDK initialization/tool listing/harmless call with protocol 2025-11-25; generated tests/typecheck/build without production credentials; and migration/lease checks on disposable PostgreSQL. These do not establish OAuth interoperability in Codex or ChatGPT.

After production went live, the user requested [pilot cleanup](mcp-server-pilot-cleanup-2026-11-17.md). The isolated hosting and pilot Entra identities have been removed; test plugins are uninstalled and private test repositories archived. The evidence below remains a historical verification record.

Pilot checklist (historical evidence; production rollout was subsequently authorized):

1. Authorize a named disposable server/identity/client pilot. Record the operator, scope, safe resource references, and supported hosts. A code implementation request does not imply changing shared OAuth clients or granting tenant-wide permissions.
2. Verify actual Graph operations with approved owned-resource permissions, or exercise the operator-prepared registration path in [MCP setup](mcp-servers.md). Never silently broaden privileges.
3. Prove that the exact managed Azure `/api/mcp` identifier URI is accepted by Entra and the intended host. Record actual v2 audience behavior. Failure keeps the template disabled pending a revised domain/resource design.
4. Record the exact supported OAuth client-binding recipe for each host: callback URI, PKCE/S256 discovery, resource/scope request, registration mode, token authentication method, binding surface, responsible actor, and whether setup repeats per tenant/server/plugin. An endpoint-only ZIP does not complete this registration. Keep credentials out of evidence.
5. Preauthorize only approved clients/scopes; assign only intended Cedarville members/groups. Verify guest denial, two distinct users, MFA/consent, refresh/reconnect, server restart, and wrong-server token rejection.
6. Authenticate, initialize, list tools, and call `get_server_info` in each intended host. Verify Codex and ChatGPT separately; a passing local token test or one passing host cannot establish another host's support.
7. Use Plugin Creator's existing-server route to save/update a private test plugin. Install before OAuth if required, with pending state explicit. Verify tools after connection; confirm no Sites, duplicates, embedded secrets, or unintended sharing.
8. Review evidence, activate the catalog only for tested support, then release portal/schema/worker and CU Launch plugin through their separate managed processes.

| Gate | Codex | ChatGPT |
| --- | --- | --- |
| Managed resource URL accepted | Passed | Passed |
| Supported client binding and PKCE discovery | Registered App binding passed; S256 confirmed and explicitly enabled | Registered App binding passed; S256 confirmed and explicitly enabled |
| Cedarville login, guest denial, two users | Sign-in passed; guests/two users pending | Sign-in passed; guests/two users pending |
| Refresh, reconnect, restart | SDK passed; host-managed behavior pending | SDK passed; host-managed behavior pending |
| MCP initialize, tools/list, harmless call | SDK initialization and native tool discovery/calls passed | SDK initialization and native tool discovery/calls passed |
| Plugin Creator save/update and post-install call | Private 0.1.1, same plugin ID, native calls passed | Private 0.1.1, same plugin ID, native calls passed |

Attach safe timestamps/commit IDs/support references when testing. Do not record tokens, secrets, raw headers, or personal claims.

## Original testing-slot catalog preview

`CU_LAUNCH_MCP_TEMPLATE_PREVIEW=true` exposes the advanced MCP template only when Azure's `WEBSITE_HOSTNAME` is exactly `cu-app-portal-testing.azurewebsites.net`. This was the initial isolated preview gate. The approved production release makes the catalog entry ACTIVE independently of this flag. Using the platform hostname also works on Linux App Service, where `WEBSITE_SLOT_NAME` may be absent. This preview allows inspection of the create form and its optional PostgreSQL choice; it does not satisfy the live OAuth or Plugin Creator gates above.

Use a separate empty testing database and testing-origin auth/link URLs. Keep `PUBLISH_TRANSPORT=disabled`, `REPOSITORY_IMPORT_TRANSPORT=disabled`, `PORTAL_MCP_ENABLED=false`, and `AZURE_PUBLISH_MCP_AUTOMATION_ENABLED=false`. Remove copied SMTP, GitHub App, publishing, queue, and directory automation credentials from the testing slot. Do not enable the test auth bypass, swap slots, or route production traffic to testing. Shared App Service and PostgreSQL compute still require bounded testing.

Before real sign-in testing, confirm the exact testing callback is registered. Any change to a shared Entra registration requires separate authorization; changing the testing slot's URL settings alone does not register its callback.
