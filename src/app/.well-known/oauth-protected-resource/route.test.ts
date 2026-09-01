import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS } from "./route";

const enabledEnvironment = {
  PORTAL_MCP_ENABLED: "true",
  PORTAL_APP_URL: "https://portal.example.edu",
  PORTAL_MCP_RESOURCE_URL: "https://portal.example.edu/api/mcp",
  PORTAL_MCP_ENTRA_TENANT_ID: "tenant-1",
  PORTAL_MCP_ENTRA_ISSUER:
    "https://login.microsoftonline.com/tenant-1/v2.0",
  PORTAL_MCP_ENTRA_AUDIENCE: "api://portal-mcp",
  PORTAL_MCP_ENTRA_SCOPE: "Portal.Codex",
};

describe("OAuth protected-resource metadata", () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(enabledEnvironment)) {
      vi.stubEnv(name, value);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("serves the exact resource, issuer, and delegated scope without caching", async () => {
    const response = await GET(
      new Request(
        "https://portal.example.edu/.well-known/oauth-protected-resource",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      resource: "https://portal.example.edu/api/mcp",
      authorization_servers: [
        "https://login.microsoftonline.com/tenant-1/v2.0",
      ],
      scopes_supported: ["Portal.Codex"],
    });
  });

  it("serves CORS preflight without caching", async () => {
    const response = await OPTIONS();

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "OPTIONS",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns a quiet 404 when the portal MCP API is disabled", async () => {
    vi.stubEnv("PORTAL_MCP_ENABLED", "false");

    const response = await GET(
      new Request(
        "https://portal.example.edu/.well-known/oauth-protected-resource",
      ),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Not found.",
        retryAfterSeconds: null,
      },
    });
  });

  it("returns the same quiet 404 for metadata preflight when disabled", async () => {
    vi.stubEnv("PORTAL_MCP_ENABLED", "false");

    const response = await OPTIONS();

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Not found.",
        retryAfterSeconds: null,
      },
    });
  });

  it("never advertises a mismatched Entra issuer", async () => {
    vi.stubEnv(
      "PORTAL_MCP_ENTRA_ISSUER",
      "https://login.microsoftonline.com/other-tenant/v2.0",
    );

    const response = await GET(
      new Request(
        "https://portal.example.edu/.well-known/oauth-protected-resource",
      ),
    );

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("other-tenant");
    expect(body).not.toContain("authorization_servers");
  });

  it.each([
    {
      name: "resource",
      setting: "PORTAL_MCP_RESOURCE_URL",
      value: "https://attacker.example/api/mcp",
    },
    {
      name: "issuer",
      setting: "PORTAL_MCP_ENTRA_ISSUER",
      value: "https://attacker.example/tenant-1/v2.0",
    },
  ])(
    "never advertises or logs an attacker $name origin",
    async ({ setting, value }) => {
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
      const infoLog = vi.spyOn(console, "info").mockImplementation(() => {});
      const ordinaryLog = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.stubEnv(setting, value);

      const response = await GET(
        new Request(
          "https://portal.example.edu/.well-known/oauth-protected-resource",
        ),
      );
      const body = await response.text();

      expect(response.status).toBe(500);
      expect(response.headers.get("WWW-Authenticate")).toBeNull();
      expect(body).not.toContain("attacker.example");
      expect(body).not.toContain("authorization_servers");
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
        "attacker.example",
      );
      expect(JSON.stringify(warnLog.mock.calls)).not.toContain(
        "attacker.example",
      );
      expect(JSON.stringify(infoLog.mock.calls)).not.toContain(
        "attacker.example",
      );
      expect(JSON.stringify(ordinaryLog.mock.calls)).not.toContain(
        "attacker.example",
      );
    },
  );
});
