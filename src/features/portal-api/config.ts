const ALLOWED_EMAIL_DOMAIN = "cedarville.edu" as const;

export type DisabledPortalApiConfig = {
  enabled: false;
};

export type EnabledPortalApiConfig = {
  enabled: true;
  resourceUrl: string;
  tenantId: string;
  issuer: string;
  audience: string;
  requiredScope: string;
  allowedEmailDomain: typeof ALLOWED_EMAIL_DOMAIN;
};

export type PortalApiConfig =
  | DisabledPortalApiConfig
  | EnabledPortalApiConfig;

function requireSetting(
  env: Record<string, string | undefined>,
  name: string,
) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when the portal MCP API is enabled.`);
  }
  return value;
}

function parseUrl(value: string, message: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(message);
  }

  return url;
}

function requirePortalOrigin(value: string) {
  const message =
    "PORTAL_APP_URL must be the canonical HTTPS portal origin.";
  const url = parseUrl(value, message);

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== "/"
  ) {
    throw new Error(message);
  }

  return url.origin;
}

function requireResourceUrl(value: string, portalOrigin: string) {
  const message =
    "PORTAL_MCP_RESOURCE_URL must be the exact HTTPS MCP endpoint.";
  const url = parseUrl(value, message);

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== "/api/mcp"
  ) {
    throw new Error(message);
  }

  if (url.origin !== portalOrigin) {
    throw new Error(
      "PORTAL_MCP_RESOURCE_URL must use the canonical portal origin and exact /api/mcp path.",
    );
  }

  return url.href;
}

function requireIssuer(value: string, tenantId: string) {
  const message =
    "PORTAL_MCP_ENTRA_ISSUER must use the exact Entra v2 issuer form.";
  const url = parseUrl(value, message);

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== `/${tenantId}/v2.0`
  ) {
    throw new Error(message);
  }

  if (url.origin !== "https://login.microsoftonline.com") {
    throw new Error(
      "PORTAL_MCP_ENTRA_ISSUER must use the exact public Microsoft Entra v2 issuer form.",
    );
  }

  return url.href;
}

export function loadPortalApiConfig(
  env: Record<string, string | undefined> = process.env,
  _nodeEnv: string | undefined = process.env.NODE_ENV,
): PortalApiConfig {
  if (env.PORTAL_MCP_ENABLED !== "true") {
    return { enabled: false };
  }

  const portalOrigin = requirePortalOrigin(
    requireSetting(env, "PORTAL_APP_URL"),
  );
  const resourceUrl = requireSetting(env, "PORTAL_MCP_RESOURCE_URL");
  const tenantId = requireSetting(env, "PORTAL_MCP_ENTRA_TENANT_ID");
  const issuer = requireSetting(env, "PORTAL_MCP_ENTRA_ISSUER");

  return {
    enabled: true,
    resourceUrl: requireResourceUrl(resourceUrl, portalOrigin),
    tenantId,
    issuer: requireIssuer(issuer, tenantId),
    audience: requireSetting(env, "PORTAL_MCP_ENTRA_AUDIENCE"),
    requiredScope: requireSetting(env, "PORTAL_MCP_ENTRA_SCOPE"),
    allowedEmailDomain: ALLOWED_EMAIL_DOMAIN,
  };
}
