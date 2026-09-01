import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { PortalApiError } from "./errors";
import {
  getPortalApiRemoteJwks,
  resolvePortalApiJwksUrl,
  validatePortalApiBearerToken,
} from "./auth";
import type { EnabledPortalApiConfig } from "./config";

const now = Math.floor(Date.now() / 1000);
const issuer = "https://login.microsoftonline.com/tenant-1/v2.0";
const validPayload: JWTPayload = {
  tid: "tenant-1",
  oid: "entra-user-1",
  aud: "api://portal-mcp",
  scp: "Portal.Codex",
  preferred_username: "person@cedarville.edu",
  name: "Portal Person",
};

const config: EnabledPortalApiConfig = {
  enabled: true,
  resourceUrl: "https://portal.example.edu/api/mcp",
  tenantId: "tenant-1",
  issuer,
  audience: "api://portal-mcp",
  requiredScope: "Portal.Codex",
  allowedEmailDomain: "cedarville.edu",
};

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let jwks: JWTVerifyGetKey;

async function signToken(
  payload: JWTPayload = validPayload,
  options: {
    signingKey?: CryptoKey;
    tokenIssuer?: string;
    expirationTime?: number;
    omitExpiration?: boolean;
    notBefore?: number;
  } = {},
) {
  let token = new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "portal-test-key" })
    .setIssuer(options.tokenIssuer ?? issuer)
    .setIssuedAt(now);

  if (!options.omitExpiration) {
    token = token.setExpirationTime(options.expirationTime ?? now + 300);
  }

  if (options.notBefore !== undefined) {
    token = token.setNotBefore(options.notBefore);
  }

  return token.sign(options.signingKey ?? privateKey);
}

async function expectAuthenticationRequired(token: string | null) {
  const authorization = token === null ? null : `Bearer ${token}`;
  try {
    await validatePortalApiBearerToken(authorization, config, { jwks });
    throw new Error("expected authentication to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(PortalApiError);
    expect(error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      message: "A valid Cedarville sign-in is required.",
    });
    expect(String(error)).not.toContain(token ?? "Bearer");
  }
}

beforeAll(async () => {
  const primary = await generateKeyPair("RS256");
  const secondary = await generateKeyPair("RS256");
  privateKey = primary.privateKey;
  otherPrivateKey = secondary.privateKey;

  const publicJwk = await exportJWK(primary.publicKey);
  publicJwk.kid = "portal-test-key";
  publicJwk.alg = "RS256";
  jwks = createLocalJWKSet({ keys: [publicJwk] });
});

afterEach(() => {
  delete process.env.E2E_AUTH_BYPASS;
});

describe("resolvePortalApiJwksUrl", () => {
  it("derives the tenant-level Entra discovery endpoint from a v2 issuer", () => {
    expect(resolvePortalApiJwksUrl(issuer, "tenant-1").href).toBe(
      "https://login.microsoftonline.com/tenant-1/discovery/v2.0/keys",
    );
  });

  it.each([
    "http://login.microsoftonline.com/tenant-1/v2.0",
    "https://login.microsoftonline.com/tenant-1/v2.0/",
    "https://login.microsoftonline.com/tenant-1/oauth2/v2.0",
    "https://user:secret@login.microsoftonline.com/tenant-1/v2.0",
    "https://login.microsoftonline.com/tenant-1/v2.0?query=value",
    "https://login.microsoftonline.com/tenant-1/v2.0#fragment",
    "not-a-url",
  ])("fails closed for unsupported issuer shape %s", (unsupportedIssuer) => {
    expect(() =>
      resolvePortalApiJwksUrl(unsupportedIssuer, "tenant-1"),
    ).toThrow("PORTAL_MCP_ENTRA_ISSUER must use the exact Entra v2 issuer form.");
  });

  it("fails closed when the issuer path does not match the configured tenant", () => {
    expect(() => resolvePortalApiJwksUrl(issuer, "tenant-2")).toThrow(
      "PORTAL_MCP_ENTRA_ISSUER must use the exact Entra v2 issuer form.",
    );
  });
});

describe("getPortalApiRemoteJwks", () => {
  it("creates one reusable remote JWKS for the resolved tenant endpoint", () => {
    const urls: string[] = [];
    const cachedConfig: EnabledPortalApiConfig = {
      ...config,
      tenantId: "cache-tenant",
      issuer: "https://login.microsoftonline.com/cache-tenant/v2.0",
    };
    const factory = (url: URL) => {
      urls.push(url.href);
      return jwks;
    };

    const first = getPortalApiRemoteJwks(cachedConfig, factory);
    const second = getPortalApiRemoteJwks(cachedConfig, factory);

    expect(first).toBe(jwks);
    expect(second).toBe(first);
    expect(urls).toEqual([
      "https://login.microsoftonline.com/cache-tenant/discovery/v2.0/keys",
    ]);

    expect(() =>
      getPortalApiRemoteJwks(
        { ...cachedConfig, tenantId: "different-tenant" },
        factory,
      ),
    ).toThrow("PORTAL_MCP_ENTRA_ISSUER must use the exact Entra v2 issuer form.");
  });
});

describe("validatePortalApiBearerToken", () => {
  it("validates a signed delegated Cedarville token", async () => {
    const token = await signToken();

    await expect(
      validatePortalApiBearerToken(`Bearer ${token}`, config, { jwks }),
    ).resolves.toEqual({
      entraOid: "entra-user-1",
      email: "person@cedarville.edu",
      displayName: "Portal Person",
    });
  });

  it("normalizes email and accepts the email claim fallback", async () => {
    const { preferred_username: _preferredUsername, ...payload } = validPayload;
    const token = await signToken({
      ...payload,
      email: "  PERSON@CEDARVILLE.EDU  ",
    });

    await expect(
      validatePortalApiBearerToken(`Bearer ${token}`, config, { jwks }),
    ).resolves.toMatchObject({ email: "person@cedarville.edu" });
  });

  it("requires exact space-separated delegated scope membership", async () => {
    const validToken = await signToken({
      ...validPayload,
      scp: "User.Read Portal.Codex Other.Scope",
    });
    const wrongToken = await signToken({
      ...validPayload,
      scp: "Portal.Codex.More",
    });

    await expect(
      validatePortalApiBearerToken(`Bearer ${validToken}`, config, { jwks }),
    ).resolves.toMatchObject({ entraOid: "entra-user-1" });
    await expectAuthenticationRequired(wrongToken);
  });

  it("rejects a token signed by an untrusted key", async () => {
    await expectAuthenticationRequired(
      await signToken(validPayload, { signingKey: otherPrivateKey }),
    );
  });

  it("rejects the wrong issuer", async () => {
    await expectAuthenticationRequired(
      await signToken(validPayload, {
        tokenIssuer: "https://login.microsoftonline.com/other/v2.0",
      }),
    );
  });

  it("rejects the wrong tenant", async () => {
    await expectAuthenticationRequired(
      await signToken({ ...validPayload, tid: "tenant-2" }),
    );
  });

  it("rejects the wrong audience", async () => {
    await expectAuthenticationRequired(
      await signToken({ ...validPayload, aud: "api://other" }),
    );
  });

  it("rejects an expired token", async () => {
    await expectAuthenticationRequired(
      await signToken(validPayload, { expirationTime: now - 1 }),
    );
  });

  it("rejects a token without an expiration claim", async () => {
    await expectAuthenticationRequired(
      await signToken(validPayload, { omitExpiration: true }),
    );
  });

  it("rejects a token whose not-before time is in the future", async () => {
    await expectAuthenticationRequired(
      await signToken(validPayload, { notBefore: now + 300 }),
    );
  });

  it("rejects a token without delegated scopes", async () => {
    const { scp: _scope, ...payload } = validPayload;
    await expectAuthenticationRequired(await signToken(payload));
  });

  it("rejects an application-only roles token", async () => {
    const { scp: _scope, ...payload } = validPayload;
    await expectAuthenticationRequired(
      await signToken({ ...payload, roles: ["Portal.Codex"] }),
    );
  });

  it("rejects a token without an object ID", async () => {
    const { oid: _oid, ...payload } = validPayload;
    await expectAuthenticationRequired(await signToken(payload));
  });

  it("rejects a token without either email claim", async () => {
    const { preferred_username: _email, ...payload } = validPayload;
    await expectAuthenticationRequired(await signToken(payload));
  });

  it("rejects a non-Cedarville identity", async () => {
    await expectAuthenticationRequired(
      await signToken({
        ...validPayload,
        preferred_username: "person@sub.cedarville.edu",
      }),
    );
  });

  it("requires a bearer token even when the browser E2E bypass is enabled", async () => {
    process.env.E2E_AUTH_BYPASS = "true";
    await expectAuthenticationRequired(null);
  });
});
