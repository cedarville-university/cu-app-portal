import React from "react";
import type { McpConnectionSummary } from "@/features/mcp-servers/connection-summary";
export function McpConnectionCard({ connection }: { connection: McpConnectionSummary | null }) {
  return <section className="card" aria-label="MCP server connection">
    <h2 className="section-title">Connect your plugin</h2>
    <p>This advanced MCP server requires Cedarville sign-in. Use Plugin Creator’s existing MCP server workflow with the Azure endpoint below.</p>
    {connection?.endpointUrl ? <p>MCP endpoint: <a href={connection.endpointUrl}>{connection.endpointUrl}</a></p> : <p>The connection endpoint is available after identity setup and successful publishing.</p>}
    <p>Identity setup: {connection?.setupStatus ?? "NOT_STARTED"}</p>
    <p>Deployment check: {connection?.deploymentProbe.status ?? "NOT_CHECKED"}{connection?.deploymentProbe.checkedAt ? ` at ${connection.deploymentProbe.checkedAt}` : ""}. Recorded checks are historical.</p>
    <p>Authenticate in the intended host, discover its tools, and verify get_server_info. Publishing and plugin creation do not verify that connection. Sites is not required.</p>
  </section>;
}
