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
      databaseProvider: "postgresql",
      entraLogin: true,
    } satisfies DeploymentManifestInput;

    expect(
      buildDeploymentManifest(input),
    ).toEqual({
      schemaVersion: "1.0.0",
      templateSlug: "web-app",
      runtime: {
        family: "node",
        framework: "nextjs",
        displayName: "Node.js 24 / Next.js",
        azureRuntimeStack: "NODE|24-lts",
        startupCommand: "npm start",
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
          startupCommand: "npm start",
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
            provider: "postgresql",
            adminUser: "portaladmin",
            sslMode: "require",
          },
        },
      },
      auth: {
        provider: "microsoft-entra-id",
        callbackPath: "/api/auth/callback/microsoft-entra-id",
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
        "NODE_ENV",
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
      databaseProvider: "postgresql",
      entraLogin: true,
    } satisfies DeploymentManifestInput;

    expect(
      buildDeploymentManifest(input),
    ).toEqual({
      schemaVersion: "1.0.0",
      templateSlug: "web-app",
      runtime: {
        family: "node",
        framework: "nextjs",
        displayName: "Node.js 24 / Next.js",
        azureRuntimeStack: "NODE|24-lts",
        startupCommand: "npm start",
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
          startupCommand: "npm start",
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
            provider: "postgresql",
            adminUser: "portaladmin",
            sslMode: "require",
          },
        },
      },
      auth: {
        provider: "microsoft-entra-id",
        callbackPath: "/api/auth/callback/microsoft-entra-id",
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
        "NODE_ENV",
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

  it("omits database and Entra defaults when those features are not selected", () => {
    const input = {
      templateSlug: "web-app",
      appName: "Campus Hub",
      description: "Student services portal",
      hostingTarget: "Azure App Service",
      databaseProvider: "none",
      entraLogin: false,
    } satisfies DeploymentManifestInput;

    const manifest = buildDeploymentManifest(input);

    expect(manifest.defaults.azure.database).toBeUndefined();
    expect(manifest.defaults.azure.shared.postgresServer).toBeUndefined();
    expect(
      Object.hasOwn(manifest.defaults.azure.shared, "postgresServer"),
    ).toBe(false);
    expect(manifest.defaults.azure.perApp.databaseNamePattern).toBeUndefined();
    expect(
      Object.hasOwn(manifest.defaults.azure.perApp, "databaseNamePattern"),
    ).toBe(false);
    expect(manifest.auth).toBeUndefined();
    expect(manifest.environments.development.databaseUrl).toBeUndefined();
    expect(manifest.environments.production.databaseUrlAppSetting).toBeUndefined();
    expect(manifest.environments.production.authUrlAppSetting).toBeUndefined();
    expect(manifest.applicationSettings).not.toContain("DATABASE_URL");
    expect(manifest.applicationSettings).not.toContain(
      "AUTH_MICROSOFT_ENTRA_ID_ID",
    );
  });

  it("uses FastAPI runtime metadata from the template catalog", () => {
    const manifest = buildDeploymentManifest({
      templateSlug: "python-fastapi",
      appName: "Reports API",
      description: "Reports endpoint",
      hostingTarget: "Azure App Service",
      databaseProvider: "none",
      entraLogin: false,
    });

    expect(manifest.runtime).toMatchObject({
      family: "python",
      framework: "fastapi",
      azureRuntimeStack: "PYTHON|3.14",
    });
    expect(manifest.defaults.azure.runtimeStack).toBe("PYTHON|3.14");
    expect(manifest.defaults.azure.startupCommand).toBe(
      "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
    );
  });
});
