# MCP server live pilot

Status November 16, 2026: **Pending. Template DISABLED.** No live Azure/Entra resource, host connection, or user plugin was created by the local implementation.

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
| Managed resource URL accepted | Pending | Pending |
| Supported client binding and PKCE discovery | Pending | Pending |
| Cedarville login, guest denial, two users | Pending | Pending |
| Refresh, reconnect, restart | Pending | Pending |
| MCP initialize, tools/list, harmless call | Pending | Pending |
| Plugin Creator save/update and post-install call | Pending | Pending |

Attach safe timestamps/commit IDs/support references when testing. Do not record tokens, secrets, raw headers, or personal claims.
