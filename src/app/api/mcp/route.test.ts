import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnabledPortalApiConfig } from "@/features/portal-api/config";
import { PortalApiError } from "@/features/portal-api/errors";
import type { PortalActor } from "@/features/portal-api/principal";

const mocks = vi.hoisted(() => ({
  authenticatePortalApiRequest: vi.fn(),
  createPortalMcpHandler: vi.fn(),
  loadPortalApiConfig: vi.fn(),
}));

vi.mock("@/features/portal-api/principal", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/features/portal-api/principal")
  >();
  return {
    ...original,
    authenticatePortalApiRequest: mocks.authenticatePortalApiRequest,
  };
});

vi.mock("@/features/portal-api/config", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/features/portal-api/config")
  >();
  return {
    ...original,
    loadPortalApiConfig: mocks.loadPortalApiConfig,
  };
});

vi.mock("@/features/portal-mcp/server", () => ({
  createPortalMcpHandler: mocks.createPortalMcpHandler,
}));

import { OPTIONS, POST } from "./route";

const actor: PortalActor = {
  userId: "user-1",
  entraOid: "entra-1",
  email: "employee@cedarville.edu",
  displayName: "Portal User",
  isAdmin: false,
};

const config: EnabledPortalApiConfig = {
  enabled: true,
  resourceUrl: "https://portal.example.edu/api/mcp",
  tenantId: "tenant-1",
  issuer: "https://login.microsoftonline.com/tenant-1/v2.0",
  audience: "api://portal-mcp",
  requiredScope: "Portal.Codex",
  allowedEmailDomain: "cedarville.edu",
};

const enabledEnvironment = {
  PORTAL_MCP_ENABLED: "true",
  PORTAL_MCP_RESOURCE_URL: config.resourceUrl,
  PORTAL_MCP_ENTRA_TENANT_ID: config.tenantId,
  PORTAL_MCP_ENTRA_ISSUER: config.issuer,
  PORTAL_MCP_ENTRA_AUDIENCE: config.audience,
  PORTAL_MCP_ENTRA_SCOPE: config.requiredScope,
};

describe("portal MCP route authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPortalApiConfig.mockReturnValue(config);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["missing", "invalid"])(
    "returns an RFC 9728 challenge before MCP initialization for %s auth",
    async (kind) => {
      mocks.authenticatePortalApiRequest.mockRejectedValue(
        new PortalApiError(
          "AUTHENTICATION_REQUIRED",
          "A valid Cedarville sign-in is required.",
        ),
      );
      const mcpHandler = vi.fn(async () => new Response("unexpected"));
      mocks.createPortalMcpHandler.mockReturnValue(mcpHandler);
      const request = new Request("https://portal.example.edu/api/mcp", {
        method: "POST",
        ...(kind === "invalid"
          ? { headers: { Authorization: "Bearer invalid-token" } }
          : {}),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe(
        'Bearer error="invalid_token", resource_metadata="https://portal.example.edu/.well-known/oauth-protected-resource"',
      );
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
        "WWW-Authenticate",
      );
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "A valid Cedarville sign-in is required.",
          retryAfterSeconds: null,
        },
      });
      expect(mocks.createPortalMcpHandler).not.toHaveBeenCalled();
      expect(mcpHandler).not.toHaveBeenCalled();
    },
  );

  it("serves enabled browser preflight without authentication or MCP initialization", async () => {
    const response = await OPTIONS(
      new Request("https://portal.example.edu/api/mcp", {
        method: "OPTIONS",
        headers: {
          Origin: "https://chatgpt.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "authorization, content-type, accept, mcp-method, mcp-name, mcp-session-id, mcp-protocol-version, last-event-id",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, DELETE, OPTIONS",
    );
    const allowedHeaders = response.headers
      .get("Access-Control-Allow-Headers")
      ?.toLowerCase();
    for (const header of [
      "authorization",
      "content-type",
      "accept",
      "mcp-method",
      "mcp-name",
      "mcp-session-id",
      "mcp-protocol-version",
      "last-event-id",
    ]) {
      expect(allowedHeaders).toContain(header);
    }
    const exposedHeaders = response.headers
      .get("Access-Control-Expose-Headers")
      ?.toLowerCase();
    for (const header of [
      "www-authenticate",
      "mcp-session-id",
      "mcp-protocol-version",
    ]) {
      expect(exposedHeaders).toContain(header);
    }
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.authenticatePortalApiRequest).not.toHaveBeenCalled();
    expect(mocks.createPortalMcpHandler).not.toHaveBeenCalled();
  });

  it("does not advertise a challenge from an invalid configured resource URL", async () => {
    const actualConfig = await vi.importActual<
      typeof import("@/features/portal-api/config")
    >("@/features/portal-api/config");
    mocks.loadPortalApiConfig.mockImplementation(() =>
      actualConfig.loadPortalApiConfig(
        {
          ...enabledEnvironment,
          PORTAL_MCP_RESOURCE_URL:
            "https://portal.example.edu/api/mcp?resource=https://attacker.example",
        },
        "production",
      ),
    );
    mocks.authenticatePortalApiRequest.mockRejectedValue(
      new PortalApiError(
        "AUTHENTICATION_REQUIRED",
        "A valid Cedarville sign-in is required.",
      ),
    );

    const response = await POST(
      new Request("https://portal.example.edu/api/mcp", { method: "POST" }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("WWW-Authenticate")).toBeNull();
    expect(await response.text()).not.toContain("attacker.example");
    expect(mocks.createPortalMcpHandler).not.toHaveBeenCalled();
  });

  it("returns quiet 404 before MCP initialization when the API is disabled", async () => {
    mocks.authenticatePortalApiRequest.mockRejectedValue(
      new PortalApiError("NOT_FOUND", "Not found."),
    );

    const response = await POST(
      new Request("https://portal.example.edu/api/mcp", { method: "POST" }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("WWW-Authenticate")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Not found.",
        retryAfterSeconds: null,
      },
    });
    expect(mocks.createPortalMcpHandler).not.toHaveBeenCalled();
  });

  it("creates the actor-bound stateless handler only after valid auth", async () => {
    const calls: string[] = [];
    mocks.authenticatePortalApiRequest.mockImplementation(async () => {
      calls.push("authenticate");
      return { actor, config };
    });
    const mcpHandler = vi.fn(async () => {
      calls.push("mcp");
      return Response.json({ initialized: true });
    });
    mocks.createPortalMcpHandler.mockImplementation(() => {
      calls.push("create-handler");
      return mcpHandler;
    });
    const request = new Request("https://portal.example.edu/api/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer signed-token" },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ initialized: true });
    expect(mocks.createPortalMcpHandler).toHaveBeenCalledWith(actor);
    expect(mcpHandler).toHaveBeenCalledWith(request);
    expect(calls).toEqual(["authenticate", "create-handler", "mcp"]);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not accept a browser session or E2E bypass without a bearer token", async () => {
    const principal = await vi.importActual<
      typeof import("@/features/portal-api/principal")
    >("@/features/portal-api/principal");
    for (const [name, value] of Object.entries(enabledEnvironment)) {
      vi.stubEnv(name, value);
    }
    vi.stubEnv("E2E_AUTH_BYPASS", "true");
    mocks.authenticatePortalApiRequest.mockImplementation(
      principal.authenticatePortalApiRequest,
    );

    const response = await POST(
      new Request("https://portal.example.edu/api/mcp", {
        method: "POST",
        headers: { Cookie: "authjs.session-token=browser-session" },
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.createPortalMcpHandler).not.toHaveBeenCalled();
  });

  it("serves an authenticated tools/list frame through the installed MCP handler", async () => {
    vi.resetModules();
    vi.doUnmock("@/features/portal-mcp/server");
    const { POST: runtimePost } = await import("./route");
    mocks.authenticatePortalApiRequest.mockResolvedValue({ actor, config });
    const request = new Request("https://portal.example.edu/api/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer signed-token",
        Accept: "application/json",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "tools/list",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
    });

    const response = await runtimePost(request);
    const frame = (await response.json()) as {
      result: {
        tools: Array<{
          name: string;
          inputSchema: {
            properties?: Record<string, { maxLength?: number }>;
          };
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(frame.result.tools.map(({ name }) => name)).toEqual([
      "list_app_templates",
      "list_my_apps",
      "create_app",
      "get_app",
      "request_github_access",
      "publish_app_to_azure",
      "get_publish_status",
      "repair_publishing_setup",
      "retry_publish",
    ]);
    expect(
      frame.result.tools.find(({ name }) => name === "get_app")?.inputSchema
        .properties?.appId?.maxLength,
    ).toBe(128);
    expect(mocks.authenticatePortalApiRequest).toHaveBeenCalledWith(request);
  });
});
