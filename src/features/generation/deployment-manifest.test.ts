import { describe, expect, it } from "vitest";
import { buildDeploymentManifest } from "./deployment-manifest";
import type { DeploymentManifestInput } from "./deployment-manifest";

describe("buildDeploymentManifest", () => {
  it("builds the supported Node/Next.js Azure App Service manifest", () => {
    const input = {
      templateSlug: "web-app",
      appName: "Campus Hub",
      description: "Student services portal",
      hostingTarget: "Azure App Service",
    } satisfies DeploymentManifestInput;

    expect(
      buildDeploymentManifest(input),
    ).toEqual({
      schemaVersion: "1.0.0",
      templateSlug: "web-app",
      runtime: {
        family: "node",
        framework: "nextjs",
        nodeVersion: "24",
      },
      hosting: {
        provider: "azure",
        service: "app-service",
      },
      deployment: {
        method: "github-actions",
      },
      defaults: {
        githubRepository: "campus-hub",
        azure: {
          resourceModel: "shared-portal-managed",
          runtimeStack: "NODE|24-lts",
          shared: {
            resourceGroup: "rg-cu-apps-published",
            appServicePlan: "asp-cu-apps-published",
            postgresServer: "psql-cu-apps-published",
          },
          perApp: {
            webAppNamePattern: "app-campus-hub-<short-request-id>",
            databaseNamePattern: "db_campus_hub_<short_request_id>",
            federatedCredentialNamePattern:
              "github-campus-hub-<short-request-id>",
          },
          database: {
            adminUser: "portaladmin",
            sslMode: "require",
          },
        },
      },
      environments: {
        development: {
          databaseUrl:
            "postgresql://portal:portal@localhost:5432/campus-hub?schema=public",
        },
        production: {
          databaseUrlAppSetting: "DATABASE_URL",
          authUrlAppSetting: "AUTH_URL",
          nextauthUrlAppSetting: "NEXTAUTH_URL",
        },
      },
      applicationSettings: [
        "DATABASE_URL",
        "AUTH_URL",
        "NEXTAUTH_URL",
        "AUTH_SECRET",
        "AUTH_MICROSOFT_ENTRA_ID_ID",
        "AUTH_MICROSOFT_ENTRA_ID_SECRET",
        "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
      ],
      automation: {
        skillPath: ".codex/skills/publish-to-azure/SKILL.md",
      },
    });
  });

  it("includes deterministic naming defaults derived from the app name", () => {
    const input = {
      templateSlug: "web-app",
      appName: "   !!!   ",
      description: "Student services portal",
      hostingTarget: "Azure App Service",
    } satisfies DeploymentManifestInput;

    expect(
      buildDeploymentManifest(input),
    ).toEqual({
      schemaVersion: "1.0.0",
      templateSlug: "web-app",
      runtime: {
        family: "node",
        framework: "nextjs",
        nodeVersion: "24",
      },
      hosting: {
        provider: "azure",
        service: "app-service",
      },
      deployment: {
        method: "github-actions",
      },
      defaults: {
        githubRepository: "app",
        azure: {
          resourceModel: "shared-portal-managed",
          runtimeStack: "NODE|24-lts",
          shared: {
            resourceGroup: "rg-cu-apps-published",
            appServicePlan: "asp-cu-apps-published",
            postgresServer: "psql-cu-apps-published",
          },
          perApp: {
            webAppNamePattern: "app-app-<short-request-id>",
            databaseNamePattern: "db_app_<short_request_id>",
            federatedCredentialNamePattern:
              "github-app-<short-request-id>",
          },
          database: {
            adminUser: "portaladmin",
            sslMode: "require",
          },
        },
      },
      environments: {
        development: {
          databaseUrl:
            "postgresql://portal:portal@localhost:5432/app?schema=public",
        },
        production: {
          databaseUrlAppSetting: "DATABASE_URL",
          authUrlAppSetting: "AUTH_URL",
          nextauthUrlAppSetting: "NEXTAUTH_URL",
        },
      },
      applicationSettings: [
        "DATABASE_URL",
        "AUTH_URL",
        "NEXTAUTH_URL",
        "AUTH_SECRET",
        "AUTH_MICROSOFT_ENTRA_ID_ID",
        "AUTH_MICROSOFT_ENTRA_ID_SECRET",
        "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
      ],
      automation: {
        skillPath: ".codex/skills/publish-to-azure/SKILL.md",
      },
    });
  });
});
