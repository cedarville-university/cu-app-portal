// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSourceSnapshot } from "./build-source-snapshot";
import { buildDeploymentManifest } from "./deployment-manifest";

export const mcpInput = { templateSlug: "mcp-server", appName: 'Tools " <test>', description: "Internal tools", hostingTarget: "Azure App Service" as const, databaseProvider: "none" as const, entraLogin: true };
describe("MCP generated source", () => {
  it("generates a separate bearer-authenticated engine with no browser credentials", async () => {
    const files = await buildSourceSnapshot(mcpInput);
    expect(JSON.parse(files["package.json"]).dependencies).toMatchObject({ "@modelcontextprotocol/sdk": "1.30.0", jose: "6.2.10" });
    expect(files["src/mcp/handler.ts"]).toBeTruthy();
    expect(files["src/auth.ts"]).toBeUndefined();
    expect(files[".env.example"]).not.toMatch(/AUTH_SECRET|CLIENT_SECRET/);
    expect(files["package-lock.json"]).toBeTruthy();
    expect(files["docs/plugin-creator-handoff.md"]).toMatch(/existing MCP server/i);
    expect(files[".github/workflows/deploy-azure-app-service.yml"]).toContain("workflow_dispatch");
  });
  it("uses bearer mode in the new manifest without auth callback settings", () => {
    expect(buildDeploymentManifest(mcpInput)).toMatchObject({ schemaVersion: "1.1.0", applicationKind: "mcp-server", auth: { mode: "entra-mcp" }, mcp: { endpointPath: "/api/mcp", transport: "streamable-http" } });
    expect(buildDeploymentManifest(mcpInput).applicationSettings).not.toContain("AUTH_SECRET");
  });
});
