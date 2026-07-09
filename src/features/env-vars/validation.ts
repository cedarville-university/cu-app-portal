export type EnvVarValidation = { ok: true } | { ok: false; error: string };

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_KEY_LENGTH = 128;
const MAX_VALUE_LENGTH = 4096;

export const RESERVED_ENV_KEYS = [
  "DATABASE_URL",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "AUTH_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ID",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
  "NODE_ENV",
  "PORT",
] as const;

export const RESERVED_ENV_KEY_PREFIXES = [
  "WEBSITE_",
  "SCM_",
  "ENABLE_ORYX",
] as const;

export function validateEnvVarKey(key: string): EnvVarValidation {
  if (!key || key.length > MAX_KEY_LENGTH || !ENV_KEY_PATTERN.test(key)) {
    return {
      ok: false,
      error:
        "Variable names must start with a letter or underscore, use only letters, digits, and underscores, and be at most 128 characters.",
    };
  }

  const upperKey = key.toUpperCase();

  if (RESERVED_ENV_KEYS.some((reserved) => reserved === upperKey)) {
    return {
      ok: false,
      error: `"${key}" is reserved and managed by the portal.`,
    };
  }

  if (RESERVED_ENV_KEY_PREFIXES.some((prefix) => upperKey.startsWith(prefix))) {
    return {
      ok: false,
      error: `Variable names starting with a reserved Azure prefix are managed by the portal.`,
    };
  }

  return { ok: true };
}

export function validateEnvVarValue(
  value: string,
  isSecret: boolean,
): EnvVarValidation {
  if (isSecret && value.length === 0) {
    return { ok: false, error: "Secret values cannot be empty." };
  }

  if (value.length > MAX_VALUE_LENGTH) {
    return {
      ok: false,
      error: "Values must be at most 4096 characters.",
    };
  }

  return { ok: true };
}

export function normalizeEnvVarKey(key: string) {
  return key.toLowerCase().replaceAll("_", "-");
}
