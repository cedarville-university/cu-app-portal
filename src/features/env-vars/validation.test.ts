import { describe, expect, it } from "vitest";

import {
  normalizeEnvVarKey,
  validateEnvVarKey,
  validateEnvVarValue,
} from "./validation";

describe("validateEnvVarKey", () => {
  it("accepts conventional env var keys", () => {
    expect(validateEnvVarKey("API_KEY")).toEqual({ ok: true });
    expect(validateEnvVarKey("_private")).toEqual({ ok: true });
    expect(validateEnvVarKey("FEATURE_FLAG_2")).toEqual({ ok: true });
  });

  it("rejects malformed keys", () => {
    for (const key of ["", "2LEADING_DIGIT", "HAS-HYPHEN", "HAS SPACE", "HAS.DOT"]) {
      expect(validateEnvVarKey(key).ok).toBe(false);
    }
  });

  it("rejects keys longer than 128 characters", () => {
    expect(validateEnvVarKey(`K${"A".repeat(128)}`).ok).toBe(false);
  });

  it("rejects reserved keys case-insensitively", () => {
    for (const key of ["DATABASE_URL", "database_url", "Auth_Secret", "PORT", "NODE_ENV", "NEXTAUTH_URL", "AUTH_MICROSOFT_ENTRA_ID_SECRET"]) {
      const result = validateEnvVarKey(key);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("reserved");
      }
    }
  });

  it("rejects reserved prefixes case-insensitively", () => {
    for (const key of ["WEBSITE_RUN_FROM_PACKAGE", "website_custom", "SCM_ANYTHING", "ENABLE_ORYX_BUILD"]) {
      expect(validateEnvVarKey(key).ok).toBe(false);
    }
  });
});

describe("validateEnvVarValue", () => {
  it("allows empty values for non-secrets but not secrets", () => {
    expect(validateEnvVarValue("", false)).toEqual({ ok: true });
    expect(validateEnvVarValue("", true).ok).toBe(false);
  });

  it("rejects values longer than 4096 characters", () => {
    expect(validateEnvVarValue("v".repeat(4097), false).ok).toBe(false);
    expect(validateEnvVarValue("v".repeat(4096), false)).toEqual({ ok: true });
  });
});

describe("normalizeEnvVarKey", () => {
  it("treats case and underscore/hyphen as equivalent", () => {
    expect(normalizeEnvVarKey("API_KEY")).toBe(normalizeEnvVarKey("api_key"));
    expect(normalizeEnvVarKey("API_KEY")).toBe("api-key");
  });
});
