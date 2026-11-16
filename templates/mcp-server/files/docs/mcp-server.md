# Authoring MCP tools

Add tools in `src/mcp/server.ts` or focused modules imported there. Each request receives its own frozen validated principal. Authorize the requested data/action server-side; never trust caller-supplied user IDs or forward the incoming MCP access token to another API.

Keep `/api/health` and OAuth discovery public. Every MCP dispatch requires a per-server delegated Entra token. No browser-cookie, app-only, or API-key fallback. Resource identity and endpoint changes require an operator-reviewed migration.

Requests are limited to 256 KiB, 20 seconds, and 60/minute per principal per process. The starter uses stateless JSON Streamable HTTP and does not advertise long-lived streams. Honor cancellation for any new upstream work. The local rate limit is not a distributed quota.

Keep arguments, results, tokens, and credentials out of logs. Health proves process availability; verify actual host OAuth, initialization, tool listing, and `get_server_info` separately. No production auth bypass exists. Enterprise app admission must exclude guests.

## Optional PostgreSQL

The default is no database. If PostgreSQL was selected at creation, CU Launch provisions a per-app database and supplies its DATABASE_URL as a managed Key Vault reference. The selected variant includes Prisma, the server-only `src/lib/db.ts` client, and an initial AppSetting schema/migration. No-database apps omit these files and dependencies.

For local work, copy `.env.example` to an ignored `.env` and use a local PostgreSQL database; never use the production database for local development. Run `npm run db:migrate -- --name your_change` when adding models, and commit the schema and migrations. Production startup runs `prisma migrate deploy` before starting the server. Do not change the managed production DATABASE_URL.

Keep health/discovery independent of database queries. Authorize each tool’s rows/actions with the validated principal; a database does not grant every user access to every record. Plugin Creator receives only the selected storage mode when known. Never copy database credentials, connection strings, or server dependencies into a plugin package.
