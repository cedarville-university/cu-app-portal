// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { loadConfig, verifyToken, metadata } from "../src/mcp/auth";

const tenant = "11111111-1111-4111-8111-111111111111";
const config = { endpoint: "https://tools.azurewebsites.net/api/mcp", tenantId: tenant, issuer: `https://login.microsoftonline.com/${tenant}/v2.0`, audience: "22222222-2222-4222-8222-222222222222", scope: "mcp.access", origins: [] as string[] };
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => { keys = await generateKeyPair("RS256"); });
async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ tid: tenant, oid: "person-a", scp: "mcp.access", preferred_username: "user@cedarville.edu", ...overrides }).setProtectedHeader({ alg: "RS256" }).setIssuer(config.issuer).setAudience(config.audience).setExpirationTime("5m").sign(keys.privateKey);
}
describe("generated MCP bearer authentication", () => {
  it("fails closed without config and uses canonical resource metadata", () => {
    expect(() => loadConfig({})).toThrow();
    expect(metadata(config)).toMatchObject({ resource: config.endpoint, authorization_servers: [config.issuer], scopes_supported: [`${config.endpoint}/mcp.access`] });
  });
  it("returns an immutable per-request principal", async () => {
    const principal = await verifyToken(`Bearer ${await token()}`, config, keys.publicKey);
    expect(principal).toEqual({ tenantId: tenant, objectId: "person-a" });
    expect(Object.isFrozen(principal)).toBe(true);
  });
  it.each([{ tid: "other" }, { oid: "" }, { scp: "other" }, { scp: undefined, roles: ["mcp.access"] }, { preferred_username: "outsider@example.org" }, { acct: 1 }])("rejects invalid claims %j", async (claims) => {
    await expect(verifyToken(`Bearer ${await token(claims)}`, config, keys.publicKey)).rejects.toThrow();
  });
  it("rejects cookies, another resource, expired and not-yet-valid tokens", async () => {
    await expect(verifyToken(null, config, keys.publicKey)).rejects.toThrow();
    const valid = await token();
    await expect(verifyToken(`Bearer ${valid}`, { ...config, audience: "other-server" }, keys.publicKey)).rejects.toThrow();
    for (const claims of [{ exp: 1 }, { nbf: Math.floor(Date.now()/1000)+600 }]) {
      const jwt = await new SignJWT({ tid: tenant, oid: "a", scp: "mcp.access", preferred_username: "a@cedarville.edu", exp: Math.floor(Date.now()/1000)+300, ...claims }).setProtectedHeader({ alg: "RS256" }).setIssuer(config.issuer).setAudience(config.audience).sign(keys.privateKey);
      await expect(verifyToken(`Bearer ${jwt}`, config, keys.publicKey)).rejects.toThrow();
    }
  });
  it("rejects an arbitrary issuer and canonical URLs with credentials or query", () => {
    expect(() => loadConfig({ MCP_RESOURCE_URL: "https://user:pass@tools.azurewebsites.net/api/mcp?x=1" })).toThrow();
  });
});
