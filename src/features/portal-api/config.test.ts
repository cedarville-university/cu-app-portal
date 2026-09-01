import { describe, expect, it } from "vitest";
import { loadPortalApiConfig } from "./config";

const enabledEnvironment = {
  PORTAL_MCP_ENABLED: "true",
  PORTAL_APP_URL: "https://portal.example.edu",
  PORTAL_MCP_RESOURCE_URL: "https://portal.example.edu/api/mcp",
  PORTAL_MCP_ENTRA_TENANT_ID: "tenant-1",
  PORTAL_MCP_ENTRA_ISSUER: "https://login.microsoftonline.com/tenant-1/v2.0",
  PORTAL_MCP_ENTRA_AUDIENCE: "api://portal-mcp",
  PORTAL_MCP_ENTRA_SCOPE: "Portal.Codex",
};

describe("loadPortalApiConfig", () => {
  it("returns only disabled state without reading identity settings", () => {
    const accessed: string[] = [];
    const env = new Proxy<Record<string, string | undefined>>(
      { PORTAL_MCP_ENABLED: "false" },
      {
        get(target, property) {
          const name = String(property);
          accessed.push(name);
          if (name !== "PORTAL_MCP_ENABLED") {
            throw new Error(`unexpected identity setting access: ${name}`);
          }
          return target[name];
        },
      },
    );

    expect(loadPortalApiConfig(env, "production")).toEqual({ enabled: false });
    expect(accessed).toEqual(["PORTAL_MCP_ENABLED"]);
  });

  it("treats every value other than exact true as disabled", () => {
    expect(
      loadPortalApiConfig({ PORTAL_MCP_ENABLED: "TRUE" }, "production"),
    ).toEqual({ enabled: false });
    expect(loadPortalApiConfig({}, "production")).toEqual({ enabled: false });
  });

  it.each([
    "PORTAL_APP_URL",
    "PORTAL_MCP_RESOURCE_URL",
    "PORTAL_MCP_ENTRA_TENANT_ID",
    "PORTAL_MCP_ENTRA_ISSUER",
    "PORTAL_MCP_ENTRA_AUDIENCE",
    "PORTAL_MCP_ENTRA_SCOPE",
  ])("fails closed when %s is missing or blank", (name) => {
    const missing = { ...enabledEnvironment, [name]: undefined };
    const blank = { ...enabledEnvironment, [name]: "   " };

    expect(() => loadPortalApiConfig(missing, "production")).toThrow(name);
    expect(() => loadPortalApiConfig(blank, "production")).toThrow(name);
  });

  it.each([
    ["PORTAL_MCP_RESOURCE_URL", "http://portal.example.edu/api/mcp"],
    [
      "PORTAL_MCP_ENTRA_ISSUER",
      "http://login.microsoftonline.com/tenant-1/v2.0",
    ],
  ])("requires HTTPS for %s in every environment", (name, value) => {
    const env = { ...enabledEnvironment, [name]: value };

    expect(() => loadPortalApiConfig(env, "production")).toThrow(name);
    expect(() => loadPortalApiConfig(env, "test")).toThrow(name);
    expect(() => loadPortalApiConfig(env, "development")).toThrow(name);
  });

  it.each([
    "https://user:secret@portal.example.edu/api/mcp",
    "https://portal.example.edu:8443/api/mcp",
    "https://portal.example.edu/api/mcp?next=https://attacker.example",
    "https://portal.example.edu/api/mcp#fragment",
    "https://portal.example.edu/api/mcp/",
    "https://portal.example.edu/other",
    "not-a-url",
  ])("rejects an ambiguous MCP resource URL shape: %s", (resourceUrl) => {
    expect(() =>
      loadPortalApiConfig(
        { ...enabledEnvironment, PORTAL_MCP_RESOURCE_URL: resourceUrl },
        "production",
      ),
    ).toThrow(
      "PORTAL_MCP_RESOURCE_URL must be the exact HTTPS MCP endpoint.",
    );
  });

  it.each([
    "http://portal.example.edu",
    "https://user:secret@portal.example.edu",
    "https://portal.example.edu:8443",
    "https://portal.example.edu?query=value",
    "https://portal.example.edu#fragment",
    "https://portal.example.edu/portal",
    "not-a-url",
  ])("rejects an ambiguous canonical portal origin: %s", (portalAppUrl) => {
    expect(() =>
      loadPortalApiConfig(
        { ...enabledEnvironment, PORTAL_APP_URL: portalAppUrl },
        "production",
      ),
    ).toThrow(
      "PORTAL_APP_URL must be the canonical HTTPS portal origin.",
    );
  });

  it("rejects an MCP resource hosted on a different origin from the portal", () => {
    expect(() =>
      loadPortalApiConfig(
        {
          ...enabledEnvironment,
          PORTAL_MCP_RESOURCE_URL: "https://attacker.example/api/mcp",
        },
        "production",
      ),
    ).toThrow(
      "PORTAL_MCP_RESOURCE_URL must use the canonical portal origin and exact /api/mcp path.",
    );
  });

  it.each([
    "http://login.microsoftonline.com/tenant-1/v2.0",
    "https://user:secret@login.microsoftonline.com/tenant-1/v2.0",
    "https://login.microsoftonline.com:8443/tenant-1/v2.0",
    "https://login.microsoftonline.com/tenant-1/v2.0?query=value",
    "https://login.microsoftonline.com/tenant-1/v2.0#fragment",
    "https://login.microsoftonline.com/tenant-1/v2.0/",
    "https://login.microsoftonline.com/other-tenant/v2.0",
    "https://login.microsoftonline.com/tenant-1/oauth2/v2.0",
    "not-a-url",
  ])("rejects an ambiguous or mismatched Entra issuer shape: %s", (issuer) => {
    expect(() =>
      loadPortalApiConfig(
        { ...enabledEnvironment, PORTAL_MCP_ENTRA_ISSUER: issuer },
        "production",
      ),
    ).toThrow(
      "PORTAL_MCP_ENTRA_ISSUER must use the exact Entra v2 issuer form.",
    );
  });

  it("rejects a tenant-shaped issuer on a non-Microsoft origin", () => {
    expect(() =>
      loadPortalApiConfig(
        {
          ...enabledEnvironment,
          PORTAL_MCP_ENTRA_ISSUER:
            "https://attacker.example/tenant-1/v2.0",
        },
        "production",
      ),
    ).toThrow(
      "PORTAL_MCP_ENTRA_ISSUER must use the exact public Microsoft Entra v2 issuer form.",
    );
  });

  it("returns normalized enabled configuration with the fixed Cedarville domain", () => {
    expect(
      loadPortalApiConfig(
        {
          ...enabledEnvironment,
          PORTAL_MCP_RESOURCE_URL: ` ${enabledEnvironment.PORTAL_MCP_RESOURCE_URL} `,
          PORTAL_MCP_ENTRA_SCOPE: " Portal.Codex ",
        },
        "production",
      ),
    ).toEqual({
      enabled: true,
      resourceUrl: "https://portal.example.edu/api/mcp",
      tenantId: "tenant-1",
      issuer: "https://login.microsoftonline.com/tenant-1/v2.0",
      audience: "api://portal-mcp",
      requiredScope: "Portal.Codex",
      allowedEmailDomain: "cedarville.edu",
    });
  });
});
