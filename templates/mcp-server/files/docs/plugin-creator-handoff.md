# Connect a plugin to this server

Use Plugin Creator’s **existing MCP server** route, preserving Azure hosting. Sites is not required. Obtain the exact canonical endpoint and nonsecret identity settings from CU Launch `get_app.mcp`; never guess a live endpoint or use the CU Launch control-plane server.

Read the installed Plugin Creator package and server-access guidance. Use the verified endpoint in portable `mcp.json` with transport `streamable-http`; configure OAuth through the supported host flow using the administrator-tested client registration. Do not put tokens, client secrets, environment files, server dependencies, or invented App IDs in the archive.

If host login requires installation first, save the requested new plugin or update the verified existing one with connection/discovery marked pending, then authenticate and discover the actual tools. Verify `get_server_info` after installation. Preserve existing plugin identity and sharing. Sharing is a separate explicit request and never grants server data permissions. Do not create a Site or duplicate a plugin to work around connection failure.

## Optional PostgreSQL

The default is no database. If PostgreSQL was selected at creation, CU Launch provisions a per-app database and supplies its DATABASE_URL as a managed Key Vault reference. The selected variant includes Prisma, the server-only `src/lib/db.ts` client, and an initial AppSetting schema/migration. No-database apps omit these files and dependencies.

For local work, copy `.env.example` to an ignored `.env` and use a local PostgreSQL database; never use the production database for local development. Run `npm run db:migrate -- --name your_change` when adding models, and commit the schema and migrations. Production startup runs `prisma migrate deploy` before starting the server. Do not change the managed production DATABASE_URL.

Keep health/discovery independent of database queries. Authorize each tool’s rows/actions with the validated principal; a database does not grant every user access to every record. Plugin Creator receives only the selected storage mode when known. Never copy database credentials, connection strings, or server dependencies into a plugin package.
