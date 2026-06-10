import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadGitHubAppConfig } from "./config";

describe("loadGitHubAppConfig", () => {
  it("keeps org selection configurable and per-org installation aware", () => {
    const config = loadGitHubAppConfig({
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: "test-key",
      GITHUB_ALLOWED_ORGS: "cedarville-it,cedarville-apps",
      GITHUB_DEFAULT_ORG: "cedarville-it",
      GITHUB_DEFAULT_REPO_VISIBILITY: "private",
      GITHUB_APP_INSTALLATIONS_JSON: JSON.stringify({
        "cedarville-it": "111",
        "cedarville-apps": "222",
      }),
    });

    expect(config.defaultOrg).toBe("cedarville-it");
    expect(config.allowedOrgs).toEqual(["cedarville-it", "cedarville-apps"]);
    expect(config.installationIdsByOrg["cedarville-apps"]).toBe("222");
  });

  it("normalizes escaped newlines in the GitHub App private key", () => {
    const config = loadGitHubAppConfig({
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: "key-line-1\\nkey-line-2",
      GITHUB_ALLOWED_ORGS: "cedarville-it",
      GITHUB_DEFAULT_ORG: "cedarville-it",
      GITHUB_DEFAULT_REPO_VISIBILITY: "private",
      GITHUB_APP_INSTALLATION_ID: "111",
    });

    expect(config.privateKey).toContain("key-line-1\nkey-line-2");
    expect(config.privateKey).not.toContain("\\n");
  });

  it("fails with a clear error when installation mapping JSON is invalid", () => {
    expect(() =>
      loadGitHubAppConfig({
        GITHUB_APP_ID: "12345",
        GITHUB_APP_PRIVATE_KEY: "test-key",
        GITHUB_ALLOWED_ORGS: "cedarville-it",
        GITHUB_DEFAULT_ORG: "cedarville-it",
        GITHUB_DEFAULT_REPO_VISIBILITY: "private",
        GITHUB_APP_INSTALLATIONS_JSON: "{not-json}",
      }),
    ).toThrow(/GITHUB_APP_INSTALLATIONS_JSON must be valid JSON/i);
  });

  it("returns the configured installation id for an org", () => {
    const config = loadGitHubAppConfig({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "key",
      GITHUB_ALLOWED_ORGS: "cedarville-it",
      GITHUB_DEFAULT_ORG: "cedarville-it",
      GITHUB_APP_INSTALLATIONS_JSON: JSON.stringify({
        "cedarville-it": "111",
        "student-org": "222",
      }),
    });

    expect(config.installationIdsByOrg["student-org"]).toBe("222");
  });

  it("refreshes local env files on runtime loads so retries use updated GitHub credentials", () => {
    const originalCwd = process.cwd();
    const originalEnv = {
      GITHUB_APP_ID: process.env.GITHUB_APP_ID,
      GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
      GITHUB_ALLOWED_ORGS: process.env.GITHUB_ALLOWED_ORGS,
      GITHUB_DEFAULT_ORG: process.env.GITHUB_DEFAULT_ORG,
      GITHUB_DEFAULT_REPO_VISIBILITY: process.env.GITHUB_DEFAULT_REPO_VISIBILITY,
      GITHUB_APP_INSTALLATION_ID: process.env.GITHUB_APP_INSTALLATION_ID,
      GITHUB_APP_INSTALLATIONS_JSON: process.env.GITHUB_APP_INSTALLATIONS_JSON,
      NODE_ENV: process.env.NODE_ENV,
    };
    const dir = mkdtempSync(join(tmpdir(), "portal-github-env-"));

    try {
      process.chdir(dir);
      process.env.NODE_ENV = "development";
      process.env.GITHUB_APP_ID = "123";
      process.env.GITHUB_APP_PRIVATE_KEY = "stale-key";
      process.env.GITHUB_ALLOWED_ORGS = "cedarville-it";
      process.env.GITHUB_DEFAULT_ORG = "cedarville-it";
      process.env.GITHUB_DEFAULT_REPO_VISIBILITY = "private";
      process.env.GITHUB_APP_INSTALLATION_ID = "111";
      delete process.env.GITHUB_APP_INSTALLATIONS_JSON;
      writeFileSync(
        join(dir, ".env.local"),
        [
          "GITHUB_APP_PRIVATE_KEY=fresh-key-line-1\\nfresh-key-line-2",
          "GITHUB_APP_INSTALLATION_ID=222",
        ].join("\n"),
      );

      const config = loadGitHubAppConfig();

      expect(config.privateKey).toBe("fresh-key-line-1\nfresh-key-line-2");
      expect(config.installationIdsByOrg["cedarville-it"]).toBe("222");
    } finally {
      process.chdir(originalCwd);
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
