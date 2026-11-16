# Connect a plugin to this server

Use Plugin Creator’s **existing MCP server** route, preserving Azure hosting. Sites is not required. Obtain the exact canonical endpoint and nonsecret identity settings from CU Launch `get_app.mcp`; never guess a live endpoint or use the CU Launch control-plane server.

Read the installed Plugin Creator package and server-access guidance. Use the verified endpoint in portable `mcp.json` with transport `streamable-http`; configure OAuth through the supported host flow using the administrator-tested client registration. Do not put tokens, client secrets, environment files, server dependencies, or invented App IDs in the archive.

If host login requires installation first, save the requested new plugin or update the verified existing one with connection/discovery marked pending, then authenticate and discover the actual tools. Verify `get_server_info` after installation. Preserve existing plugin identity and sharing. Sharing is a separate explicit request and never grants server data permissions. Do not create a Site or duplicate a plugin to work around connection failure.
