# MCP server live pilot

Status November 17, 2026: **Both isolated MCP servers published; diagnostic Entra/PKCE, MCP calls, refresh, PostgreSQL persistence after restart/reconnection, and wrong-server denial passed. Native host/Plugin Creator gates remain open. Template DISABLED outside the testing preview.** The [isolated portal testing deployment](mcp-server-testing-deployment-2026-11-16.md) verifies the portal form and portal sign-in. The separate [live pilot record](mcp-server-live-pilot-2026-11-17.md) records exact resources, successful workflows, the startup-probe repair, scoped access removal, and remaining verification.

Local evidence covers the locked SDK 1.30.0, jose 6.2.10, zod 3.25.76, and Next.js 15.5.19; real locally signed JWTs; SDK initialization/tool listing/harmless call with protocol 2025-11-25; generated tests/typecheck/build without production credentials; and migration/lease checks on disposable PostgreSQL. These do not establish OAuth interoperability in Codex or ChatGPT.

Before activation:

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
| Managed resource URL accepted | Entra accepted; native host pending | Entra accepted; native host pending |
| Supported client binding and PKCE discovery | Pending | Pending |
| Cedarville login, guest denial, two users | Pending | Pending |
| Refresh, reconnect, restart | Pending | Pending |
| MCP initialize, tools/list, harmless call | Pending | Pending |
| Plugin Creator save/update and post-install call | Pending | Pending |

Attach safe timestamps/commit IDs/support references when testing. Do not record tokens, secrets, raw headers, or personal claims.

## Testing-slot catalog preview

`CU_LAUNCH_MCP_TEMPLATE_PREVIEW=true` exposes the advanced MCP template only when Azure's `WEBSITE_HOSTNAME` is exactly `cu-app-portal-testing.azurewebsites.net`. The catalog entry remains disabled everywhere else, including production. Using the platform hostname also works on Linux App Service, where `WEBSITE_SLOT_NAME` may be absent. This preview allows inspection of the create form and its optional PostgreSQL choice; it does not satisfy the live OAuth or Plugin Creator gates above.

Use a separate empty testing database and testing-origin auth/link URLs. Keep `PUBLISH_TRANSPORT=disabled`, `REPOSITORY_IMPORT_TRANSPORT=disabled`, `PORTAL_MCP_ENABLED=false`, and `AZURE_PUBLISH_MCP_AUTOMATION_ENABLED=false`. Remove copied SMTP, GitHub App, publishing, queue, and directory automation credentials from the testing slot. Do not enable the test auth bypass, swap slots, or route production traffic to testing. Shared App Service and PostgreSQL compute still require bounded testing.

Before real sign-in testing, confirm the exact testing callback is registered. Any change to a shared Entra registration requires separate authorization; changing the testing slot's URL settings alone does not register its callback.
