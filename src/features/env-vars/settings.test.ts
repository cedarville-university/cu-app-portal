import { describe, expect, it } from "vitest";

import { buildUserAppSettings, keyVaultReference } from "./settings";

describe("keyVaultReference", () => {
  it("builds a key vault app setting reference from the env key", () => {
    expect(
      keyVaultReference("https://kv-campus-dashb-clx9abc1.vault.azure.net", "API_KEY"),
    ).toBe(
      "@Microsoft.KeyVault(SecretUri=https://kv-campus-dashb-clx9abc1.vault.azure.net/secrets/API-KEY)",
    );
  });

  it("tolerates a trailing slash on the vault uri", () => {
    expect(
      keyVaultReference("https://kv-x.vault.azure.net/", "TOKEN"),
    ).toBe("@Microsoft.KeyVault(SecretUri=https://kv-x.vault.azure.net/secrets/TOKEN)");
  });
});

describe("buildUserAppSettings", () => {
  it("maps non-secrets to literal values and secrets to references", () => {
    expect(
      buildUserAppSettings(
        [
          { key: "FEATURE_FLAG", isSecret: false, value: "on" },
          { key: "API_KEY", isSecret: true, value: null },
        ],
        "https://kv-x.vault.azure.net",
      ),
    ).toEqual({
      FEATURE_FLAG: "on",
      API_KEY: "@Microsoft.KeyVault(SecretUri=https://kv-x.vault.azure.net/secrets/API-KEY)",
    });
  });

  it("treats a null non-secret value as an empty string", () => {
    expect(
      buildUserAppSettings([{ key: "EMPTY", isSecret: false, value: null }], null),
    ).toEqual({ EMPTY: "" });
  });

  it("throws when a secret exists without a vault", () => {
    expect(() =>
      buildUserAppSettings([{ key: "API_KEY", isSecret: true, value: null }], null),
    ).toThrow("no Key Vault");
  });
});
