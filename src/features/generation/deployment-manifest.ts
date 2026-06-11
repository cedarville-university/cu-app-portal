import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { getTemplateBySlug } from "@/features/templates/catalog";
import type { AppServiceRuntime } from "@/features/templates/types";

export type DeploymentManifestInput = Omit<
  CreateAppRequestInput,
  "hostingTarget"
> & {
  hostingTarget: "Azure App Service";
};

export type DeploymentManifest = {
  schemaVersion: "1.0.0";
  templateSlug: string;
  runtime: {
    family: AppServiceRuntime["family"];
    framework: AppServiceRuntime["framework"];
    displayName: string;
    azureRuntimeStack: string;
    startupCommand: string;
  };
  auth?: {
    provider: "microsoft-entra-id";
    callbackPath: "/api/auth/callback/microsoft-entra-id";
  };
  hosting: {
    provider: "azure";
    service: "app-service";
  };
  deployment: {
    method: "github-actions";
  };
  defaults: {
    githubRepository: string;
    azure: {
      resourceModel: "shared-portal-managed";
      runtimeStack: string;
      startupCommand: string;
      shared: {
        resourceGroup: string;
        appServicePlan: string;
        postgresServer: string;
      };
      perApp: {
        webAppNamePattern: string;
        databaseNamePattern: string;
        federatedCredentialNamePattern: string;
      };
      database?: {
        provider: "postgresql";
        adminUser: string;
        sslMode: "require";
      };
    };
  };
  environments: {
    development: {
      databaseUrl?: string;
    };
    production: {
      databaseUrlAppSetting?: "DATABASE_URL";
      authUrlAppSetting?: "AUTH_URL";
      nextauthUrlAppSetting?: "NEXTAUTH_URL";
    };
  };
  applicationSettings: string[];
  automation: {
    skillPath: ".codex/skills/publish-to-azure/SKILL.md";
  };
};

function toSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return slug || "app";
}

function toDatabaseNameSegment(value: string) {
  return value.replaceAll("-", "_");
}

export function buildDeploymentManifest(
  input: DeploymentManifestInput,
): DeploymentManifest {
  const template = getTemplateBySlug(input.templateSlug);

  if (!template) {
    throw new Error(`Template "${input.templateSlug}" not found.`);
  }

  const runtime = template.appServiceRuntime;
  const appSlug = toSlug(input.appName);
  const databaseNameSegment = toDatabaseNameSegment(appSlug);
  const hasDatabase = input.databaseProvider === "postgresql";
  const hasEntraLogin = input.entraLogin;
  const applicationSettings = ["NODE_ENV"];

  if (hasDatabase) {
    applicationSettings.push("DATABASE_URL");
  }

  if (hasEntraLogin) {
    applicationSettings.push(
      "AUTH_URL",
      "NEXTAUTH_URL",
      "AUTH_SECRET",
      "AUTH_MICROSOFT_ENTRA_ID_ID",
      "AUTH_MICROSOFT_ENTRA_ID_SECRET",
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
    );
  }

  return {
    schemaVersion: "1.0.0",
    templateSlug: input.templateSlug,
    runtime: {
      family: runtime.family,
      framework: runtime.framework,
      displayName: runtime.displayName,
      azureRuntimeStack: runtime.azureRuntimeStack,
      startupCommand: runtime.startupCommand,
    },
    ...(hasEntraLogin
      ? {
          auth: {
            provider: "microsoft-entra-id",
            callbackPath: "/api/auth/callback/microsoft-entra-id",
          },
        }
      : {}),
    hosting: {
      provider: "azure",
      service: "app-service",
    },
    deployment: {
      method: "github-actions",
    },
    defaults: {
      githubRepository: appSlug,
      azure: {
        resourceModel: "shared-portal-managed",
        runtimeStack: runtime.azureRuntimeStack,
        startupCommand: runtime.startupCommand,
        shared: {
          resourceGroup: "rg-cu-apps-published",
          appServicePlan: "asp-cu-apps-published",
          postgresServer: "psql-cu-apps-published",
        },
        perApp: {
          webAppNamePattern: `app-${appSlug}-<short-request-id>`,
          databaseNamePattern: `db_${databaseNameSegment}_<short_request_id>`,
          federatedCredentialNamePattern: `github-${appSlug}-<short-request-id>`,
        },
        ...(hasDatabase
          ? {
              database: {
                provider: "postgresql",
                adminUser: "portaladmin",
                sslMode: "require",
              },
            }
          : {}),
      },
    },
    environments: {
      development: {
        ...(hasDatabase
          ? {
              databaseUrl: `postgresql://portal:portal@localhost:5432/${appSlug}?schema=public`,
            }
          : {}),
      },
      production: {
        ...(hasDatabase
          ? {
              databaseUrlAppSetting: "DATABASE_URL",
            }
          : {}),
        ...(hasEntraLogin
          ? {
              authUrlAppSetting: "AUTH_URL",
              nextauthUrlAppSetting: "NEXTAUTH_URL",
            }
          : {}),
      },
    },
    applicationSettings,
    automation: {
      skillPath: ".codex/skills/publish-to-azure/SKILL.md",
    },
  };
}
