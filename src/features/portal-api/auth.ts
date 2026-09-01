import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import type { EnabledPortalApiConfig } from "./config";
import { PortalApiError } from "./errors";

export type ValidatedEntraPrincipal = {
  entraOid: string;
  email: string;
  displayName: string;
};

const AUTHENTICATION_MESSAGE = "A valid Cedarville sign-in is required.";
const INVALID_ISSUER_MESSAGE =
  "PORTAL_MCP_ENTRA_ISSUER must use the exact Entra v2 issuer form.";
type RemoteJwksFactory = (url: URL) => JWTVerifyGetKey;
const remoteJwksByUrl = new Map<string, JWTVerifyGetKey>();

export function resolvePortalApiJwksUrl(issuer: string, tenantId: string) {
  let issuerUrl: URL;
  try {
    issuerUrl = new URL(issuer);
  } catch {
    throw new Error(INVALID_ISSUER_MESSAGE);
  }

  if (
    issuerUrl.protocol !== "https:" ||
    issuerUrl.username !== "" ||
    issuerUrl.password !== "" ||
    issuerUrl.port !== "" ||
    issuerUrl.search !== "" ||
    issuerUrl.hash !== "" ||
    issuerUrl.pathname !== `/${tenantId}/v2.0`
  ) {
    throw new Error(INVALID_ISSUER_MESSAGE);
  }

  return new URL(
    `/${tenantId}/discovery/v2.0/keys`,
    issuerUrl.origin,
  );
}

export function getPortalApiRemoteJwks(
  config: EnabledPortalApiConfig,
  factory: RemoteJwksFactory = createRemoteJWKSet,
) {
  const jwksUrl = resolvePortalApiJwksUrl(config.issuer, config.tenantId);
  const cacheKey = jwksUrl.href;
  const existing = remoteJwksByUrl.get(cacheKey);
  if (existing) return existing;

  const jwks = factory(jwksUrl);
  remoteJwksByUrl.set(cacheKey, jwks);
  return jwks;
}

function authenticationRequired() {
  return new PortalApiError("AUTHENTICATION_REQUIRED", AUTHENTICATION_MESSAGE);
}

function readBearerToken(authorization: string | null) {
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw authenticationRequired();
  return match[1];
}

function requirePrincipalClaims(
  payload: JWTPayload,
  config: EnabledPortalApiConfig,
): ValidatedEntraPrincipal {
  if (payload.tid !== config.tenantId) throw authenticationRequired();

  if (
    typeof payload.scp !== "string" ||
    !payload.scp.split(" ").includes(config.requiredScope)
  ) {
    throw authenticationRequired();
  }

  if (typeof payload.oid !== "string" || !payload.oid.trim()) {
    throw authenticationRequired();
  }

  const emailClaim = payload.preferred_username ?? payload.email;
  if (typeof emailClaim !== "string") throw authenticationRequired();

  const email = emailClaim.trim().toLowerCase();
  if (!email.endsWith(`@${config.allowedEmailDomain}`)) {
    throw authenticationRequired();
  }

  const displayName =
    typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : email;

  return {
    entraOid: payload.oid.trim(),
    email,
    displayName,
  };
}

export async function validatePortalApiBearerToken(
  authorization: string | null,
  config: EnabledPortalApiConfig,
  dependencies: {
    jwks?: JWTVerifyGetKey;
    remoteJwksFactory?: RemoteJwksFactory;
  } = {},
): Promise<ValidatedEntraPrincipal> {
  try {
    const token = readBearerToken(authorization);
    const jwks =
      dependencies.jwks ??
      getPortalApiRemoteJwks(
        config,
        dependencies.remoteJwksFactory,
      );
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
      requiredClaims: ["exp"],
    });

    return requirePrincipalClaims(payload, config);
  } catch {
    throw authenticationRequired();
  }
}
