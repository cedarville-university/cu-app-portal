# Authoring MCP tools

Add tools in `src/mcp/server.ts` or focused modules imported there. Each request receives its own frozen validated principal. Authorize the requested data/action server-side; never trust caller-supplied user IDs or forward the incoming MCP access token to another API.

Keep `/api/health` and OAuth discovery public. Every MCP dispatch requires a per-server delegated Entra token. No browser-cookie, app-only, or API-key fallback. Resource identity and endpoint changes require an operator-reviewed migration.

Requests are limited to 256 KiB, 20 seconds, and 60/minute per principal per process. The starter uses stateless JSON Streamable HTTP and does not advertise long-lived streams. Honor cancellation for any new upstream work. The local rate limit is not a distributed quota.

Keep arguments, results, tokens, and credentials out of logs. Health proves process availability; verify actual host OAuth, initialization, tool listing, and `get_server_info` separately. No production auth bypass exists. Enterprise app admission must exclude guests.
