import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpPrincipal } from "./auth";

export function createServer(principal: McpPrincipal, displayName = "CU Launch MCP server") {
  const server = new McpServer({ name: displayName, version: "1.0.0" });
  // Capture the validated request identity here when adding tools. Never accept
  // a caller identity as a tool argument or forward the incoming access token.
  Object.freeze(principal);
  server.registerTool("get_server_info", {
    title: "Get server information", description: "Return harmless information about this starter server.",
    inputSchema: z.object({}).strict(), outputSchema: { name: z.string(), version: z.string(), message: z.string() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["mcp.access"] }] },
  }, async () => {
    const result = { name: displayName, version: "1.0.0", message: "Cedarville MCP starter is ready to customize." };
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
  });
  return server;
}
