import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const visibilitySchema = z.enum(["private", "internal", "public"]);

const githubAppConfigSchema = z
  .object({
    GITHUB_APP_ID: z.string().regex(/^\d+$/),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1),
    GITHUB_ALLOWED_ORGS: z.string().min(1),
    GITHUB_DEFAULT_ORG: z.string().min(1),
    GITHUB_DEFAULT_REPO_VISIBILITY: visibilitySchema.default("private"),
    GITHUB_APP_INSTALLATION_ID: z.string().regex(/^\d+$/).optional(),
    GITHUB_APP_INSTALLATIONS_JSON: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.GITHUB_APP_INSTALLATION_ID && !value.GITHUB_APP_INSTALLATIONS_JSON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide GITHUB_APP_INSTALLATION_ID or GITHUB_APP_INSTALLATIONS_JSON.",
      });
    }
  });

export type GitHubRepoVisibility = z.infer<typeof visibilitySchema>;

export type GitHubAppConfig = {
  appId: string;
  privateKey: string;
  allowedOrgs: string[];
  defaultOrg: string;
  defaultRepoVisibility: GitHubRepoVisibility;
  installationIdsByOrg: Record<string, string>;
};

type LoadGitHubAppConfigOptions = {
  envFileDirectory?: string;
  reloadLocalEnv?: boolean;
};

function normalizePrivateKey(value: string) {
  return value.includes("\\n") ? value.replaceAll("\\n", "\n") : value;
}

function unquoteDotEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readDotEnvFile(filename: string) {
  const values: Record<string, string> = {};

  try {
    const contents = readFileSync(filename, "utf8");

    for (const line of contents.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = unquoteDotEnvValue(trimmed.slice(separatorIndex + 1).trim());

      if (key) {
        values[key] = value;
      }
    }
  } catch {
    // Local env files are optional in production, CI, and tests.
  }

  return values;
}

function withLocalEnvFileOverrides(
  source: Record<string, string | undefined>,
  directory: string,
) {
  return {
    ...source,
    ...readDotEnvFile(join(directory, ".env")),
    ...readDotEnvFile(join(directory, ".env.local")),
  };
}

function parseInstallationIds(
  defaultOrg: string,
  defaultInstallationId: string | undefined,
  rawInstallations: string | undefined,
) {
  if (rawInstallations) {
    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(rawInstallations) as unknown;
    } catch (error) {
      throw new Error(
        `GITHUB_APP_INSTALLATIONS_JSON must be valid JSON. ${
          error instanceof Error ? error.message : "unknown parse error"
        }`,
      );
    }

    const parsed = z.record(z.string().regex(/^\d+$/)).parse(parsedJson);

    return parsed;
  }

  if (!defaultInstallationId) {
    throw new Error(
      "Provide GITHUB_APP_INSTALLATION_ID or GITHUB_APP_INSTALLATIONS_JSON.",
    );
  }

  return {
    [defaultOrg]: defaultInstallationId,
  };
}

export function loadGitHubAppConfig(
  source: Record<string, string | undefined> = process.env,
  options: LoadGitHubAppConfigOptions = {},
): GitHubAppConfig {
  const shouldReloadLocalEnv =
    options.reloadLocalEnv ??
    (source === process.env && process.env.NODE_ENV !== "production");
  const configSource = shouldReloadLocalEnv
    ? withLocalEnvFileOverrides(source, options.envFileDirectory ?? process.cwd())
    : source;
  const parsed = githubAppConfigSchema.parse(configSource);
  const allowedOrgs = parsed.GITHUB_ALLOWED_ORGS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!allowedOrgs.includes(parsed.GITHUB_DEFAULT_ORG)) {
    allowedOrgs.push(parsed.GITHUB_DEFAULT_ORG);
  }

  return {
    appId: parsed.GITHUB_APP_ID,
    privateKey: normalizePrivateKey(parsed.GITHUB_APP_PRIVATE_KEY),
    allowedOrgs,
    defaultOrg: parsed.GITHUB_DEFAULT_ORG,
    defaultRepoVisibility: parsed.GITHUB_DEFAULT_REPO_VISIBILITY,
    installationIdsByOrg: parseInstallationIds(
      parsed.GITHUB_DEFAULT_ORG,
      parsed.GITHUB_APP_INSTALLATION_ID,
      parsed.GITHUB_APP_INSTALLATIONS_JSON,
    ),
  };
}
