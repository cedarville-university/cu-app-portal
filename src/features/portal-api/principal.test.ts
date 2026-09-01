import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
} from "jose";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { PortalApiError } from "./errors";
import {
  authenticatePortalApiRequest,
  resolvePortalActor,
  type PortalUserStore,
} from "./principal";

type StoredUser = {
  id: string;
  entraOid: string;
  email: string;
  displayName: string;
};

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

function createInMemoryUserStore() {
  const users = new Map<string, StoredUser>();
  let nextId = 1;
  const store: PortalUserStore = {
    async upsert({ where, update, create }) {
      const existing = users.get(where.entraOid);
      if (existing) {
        const updated = { ...existing, ...update };
        users.set(where.entraOid, updated);
        return updated;
      }

      const user = { id: `user-${nextId++}`, ...create };
      users.set(where.entraOid, user);
      return user;
    },
  };
  return { store, users };
}

let privateKey: CryptoKey;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const keyPair = await generateKeyPair("RS256");
  privateKey = keyPair.privateKey;
  const publicJwk = await exportJWK(keyPair.publicKey);
  publicJwk.kid = "principal-test-key";
  publicJwk.alg = "RS256";
  jwks = createLocalJWKSet({ keys: [publicJwk] });
});

afterEach(() => {
  delete process.env.E2E_AUTH_BYPASS;
});

describe("resolvePortalActor", () => {
  it("upserts by Entra object ID and refreshes cached identity fields", async () => {
    const { store, users } = createInMemoryUserStore();
    const hasAdminRole = async () => false;

    const first = await resolvePortalActor(
      {
        entraOid: "entra-user-1",
        email: "old@cedarville.edu",
        displayName: "Old Name",
      },
      { users: store, hasAdminRole },
    );
    const second = await resolvePortalActor(
      {
        entraOid: "entra-user-1",
        email: "new@cedarville.edu",
        displayName: "New Name",
      },
      { users: store, hasAdminRole },
    );

    expect(first.userId).toBe("user-1");
    expect(second).toEqual({
      userId: "user-1",
      entraOid: "entra-user-1",
      email: "new@cedarville.edu",
      displayName: "New Name",
      isAdmin: false,
    });
    expect([...users.values()]).toEqual([
      {
        id: "user-1",
        entraOid: "entra-user-1",
        email: "new@cedarville.edu",
        displayName: "New Name",
      },
    ]);
  });

  it("derives administrator status from the portal role lookup", async () => {
    const { store } = createInMemoryUserStore();
    const checkedUserIds: string[] = [];

    const actor = await resolvePortalActor(
      {
        entraOid: "entra-admin-1",
        email: "admin@cedarville.edu",
        displayName: "Portal Admin",
      },
      {
        users: store,
        async hasAdminRole(userId) {
          checkedUserIds.push(userId);
          return true;
        },
      },
    );

    expect(actor.isAdmin).toBe(true);
    expect(checkedUserIds).toEqual(["user-1"]);
  });
});

describe("authenticatePortalApiRequest", () => {
  it("validates the request bearer token and resolves its portal actor", async () => {
    const { store } = createInMemoryUserStore();
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      tid: "tenant-1",
      oid: "entra-user-1",
      aud: "api://portal-mcp",
      scp: "Portal.Codex",
      preferred_username: "person@cedarville.edu",
      name: "Portal Person",
    })
      .setProtectedHeader({ alg: "RS256", kid: "principal-test-key" })
      .setIssuer("https://login.microsoftonline.com/tenant-1/v2.0")
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey);

    const result = await authenticatePortalApiRequest(
      new Request("https://portal.example.edu/api/mcp", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      {
        env: enabledEnvironment,
        nodeEnv: "test",
        jwks,
        users: store,
        hasAdminRole: async () => false,
      },
    );

    expect(result).toEqual({
      actor: {
        userId: "user-1",
        entraOid: "entra-user-1",
        email: "person@cedarville.edu",
        displayName: "Portal Person",
        isAdmin: false,
      },
      config: {
        enabled: true,
        resourceUrl: "https://portal.example.edu/api/mcp",
        tenantId: "tenant-1",
        issuer: "https://login.microsoftonline.com/tenant-1/v2.0",
        audience: "api://portal-mcp",
        requiredScope: "Portal.Codex",
        allowedEmailDomain: "cedarville.edu",
      },
    });
  });

  it("returns quiet NOT_FOUND when disabled even with the browser bypass enabled", async () => {
    process.env.E2E_AUTH_BYPASS = "true";

    await expect(
      authenticatePortalApiRequest(
        new Request("https://portal.example.edu/api/mcp"),
        {
          env: { PORTAL_MCP_ENABLED: "false" },
          nodeEnv: "test",
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PortalApiError>>({
        code: "NOT_FOUND",
        message: "Not found.",
      }),
    );
  });
});
