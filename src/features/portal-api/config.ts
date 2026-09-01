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

function requireUrl(name: string, value: string, nodeEnv: string | undefined) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (
    nodeEnv !== "test" &&
    nodeEnv !== "development" &&
    url.protocol !== "https:"
  ) {
    throw new Error(`${name} must use HTTPS outside test and development.`);
  }

  return value;
}

export function loadPortalApiConfig(
  env: Record<string, string | undefined> = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): PortalApiConfig {
  if (env.PORTAL_MCP_ENABLED !== "true") {
    return { enabled: false };
  }

  const resourceUrl = requireSetting(env, "PORTAL_MCP_RESOURCE_URL");
  const issuer = requireSetting(env, "PORTAL_MCP_ENTRA_ISSUER");

  return {
    enabled: true,
    resourceUrl: requireUrl("PORTAL_MCP_RESOURCE_URL", resourceUrl, nodeEnv),
    tenantId: requireSetting(env, "PORTAL_MCP_ENTRA_TENANT_ID"),
    issuer: requireUrl("PORTAL_MCP_ENTRA_ISSUER", issuer, nodeEnv),
    audience: requireSetting(env, "PORTAL_MCP_ENTRA_AUDIENCE"),
    requiredScope: requireSetting(env, "PORTAL_MCP_ENTRA_SCOPE"),
    allowedEmailDomain: ALLOWED_EMAIL_DOMAIN,
  };
}
