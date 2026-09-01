import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const runbookPath = "docs/portal/codex-workspace-plugin.md";

function readDoc(path: string) {
  return readFileSync(`${root}/${path}`, "utf8");
}

function allOperatorDocs() {
  return [
    readDoc("README.md"),
    readDoc("docs/portal/setup.md"),
    readDoc("docs/portal/technical-operations.md"),
    readDoc(runbookPath),
  ].join("\n");
}

describe("Codex workspace plugin operator documentation", () => {
  it("documents disabled local MCP configuration and its separate delegated resource", () => {
    const docs = allOperatorDocs();
    const settings = [
      "PORTAL_MCP_ENABLED",
      "PORTAL_MCP_RESOURCE_URL",
      "PORTAL_MCP_ENTRA_TENANT_ID",
      "PORTAL_MCP_ENTRA_ISSUER",
      "PORTAL_MCP_ENTRA_AUDIENCE",
      "PORTAL_MCP_ENTRA_SCOPE",
      "PORTAL_MCP_RATE_READ_MAX",
      "PORTAL_MCP_RATE_CREATE_MAX",
      "PORTAL_MCP_RATE_GITHUB_ACCESS_MAX",
      "PORTAL_MCP_RATE_PUBLISH_MAX",
      "PORTAL_MCP_RATE_REPAIR_MAX",
      "PORTAL_MCP_RATE_RETRY_MAX",
    ];

    for (const setting of settings) expect(docs).toContain(setting);
    expect(docs).toContain("/api/mcp");
    expect(docs).toContain("/.well-known/oauth-protected-resource");
    expect(docs).toMatch(/disabled by default/i);
    expect(docs).toMatch(/Auth\.js browser credentials[\s\S]{0,160}do not automatically configure[\s\S]{0,160}delegated MCP resource/i);
  });

  it("gives operators the exact MCP contract and production security gates", () => {
    const docs = allOperatorDocs();
    const tools = [
      "list_app_templates",
      "list_my_apps",
      "create_app",
      "get_app",
      "request_github_access",
      "publish_app_to_azure",
      "get_publish_status",
      "repair_publishing_setup",
      "retry_publish",
    ];

    for (const tool of tools) expect(docs).toContain(tool);
    expect(docs).toMatch(/OAuth 2\.1[\s\S]{0,120}PKCE/i);
    expect(docs).toMatch(/authorization code[\s-]*flow[\s\S]{0,120}S256/i);
    expect(docs).toMatch(/issuer[\s\S]{0,120}tenant[\s\S]{0,120}audience[\s\S]{0,120}scope/i);
    expect(docs).toMatch(/delegated[\s\S]{0,120}@cedarville\.edu/i);
    expect(docs).toMatch(/exact OpenAI redirect URI/i);
    expect(docs).toMatch(/protected metadata/i);
  });

  it("states the approved rate limits and the role-limited marketplace pilot", () => {
    const docs = allOperatorDocs();
    const limits = [
      "120 requests / 10 minutes",
      "3 requests / hour",
      "10 requests / hour",
      "6 requests / hour",
    ];

    for (const limit of limits) expect(docs).toContain(limit);
    expect(docs).toContain(".agents/plugins/marketplace.json");
    expect(docs).toContain("./plugins/cedarville-app-portal");
    expect(docs).toContain("AVAILABLE");
    expect(docs).toContain("ON_INSTALL");
    expect(docs).toMatch(/workspace admin[\s\S]{0,180}restricted pilot role/i);
    expect(docs).toMatch(/disposable-app smoke test/i);
  });

  it("provides the deployment-finalization, rollback, and operational boundaries", () => {
    expect(existsSync(`${root}/${runbookPath}`)).toBe(true);
    const docs = allOperatorDocs();

    expect(docs).toContain('node scripts/plugins/finalize-portal-plugin.mjs --app-id "$PORTAL_PLUGIN_APP_ID"');
    expect(docs).toMatch(/real[\s\S]{0,100}plugin_asdk_app/i);
    expect(docs).toMatch(/do not[\s\S]{0,100}placeholder/i);
    expect(docs).toMatch(/validate and commit[\s\S]{0,180}finalized package/i);
    expect(docs).toMatch(/migration[\s\S]{0,120}deploy[\s\S]{0,120}MCP disabled/i);
    expect(docs).toMatch(/rollback[\s\S]{0,180}workspace plugin[\s\S]{0,180}PORTAL_MCP_ENABLED/i);
    expect(docs).toMatch(/never delete[\s\S]{0,160}(GitHub|Azure)[\s\S]{0,160}(GitHub|Azure)/i);
    expect(docs).toMatch(/audit/i);
    expect(docs).toMatch(/monitor/i);
    expect(docs).toMatch(/retention|cleanup/i);
  });

  it("does not claim administrator-owned rollout evidence or leak placeholder credentials", () => {
    const docs = allOperatorDocs();

    expect(docs).toMatch(/locally verified/i);
    expect(docs).toMatch(/administrator-owned|administrator owned/i);
    expect(docs).toMatch(/not yet verified|partial|not complete/i);
    expect(docs).not.toContain("plugin_asdk_app_example");
    expect(docs).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{24,}/);
    expect(docs).not.toMatch(/client_secret\s*[=:]\s*[^\s<][^\s]{8,}/i);
    expect(docs).not.toMatch(/production (Entra )?registration (is )?(complete|configured)/i);
  });
});
