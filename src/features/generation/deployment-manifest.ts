import type { CreateAppRequestInput } from "@/features/app-requests/types";

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
    family: "node";
    framework: "nextjs";
    nodeVersion: "24";
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
      runtimeStack: "NODE|24-lts";
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
      database: {
        adminUser: string;
        sslMode: "require";
      };
    };
  };
  environments: {
    development: {
      databaseUrl: string;
    };
    production: {
      databaseUrlAppSetting: "DATABASE_URL";
      authUrlAppSetting: "AUTH_URL";
      nextauthUrlAppSetting: "NEXTAUTH_URL";
    };
  };
  applicationSettings: [
    "DATABASE_URL",
    "AUTH_URL",
    "NEXTAUTH_URL",
    "AUTH_SECRET",
    "AUTH_MICROSOFT_ENTRA_ID_ID",
    "AUTH_MICROSOFT_ENTRA_ID_SECRET",
    "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
  ];
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
  const appSlug = toSlug(input.appName);
  const databaseNameSegment = toDatabaseNameSegment(appSlug);

  return {
    schemaVersion: "1.0.0",
    templateSlug: input.templateSlug,
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
      githubRepository: appSlug,
      azure: {
        resourceModel: "shared-portal-managed",
        runtimeStack: "NODE|24-lts",
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
        database: {
          adminUser: "portaladmin",
          sslMode: "require",
        },
      },
    },
    environments: {
      development: {
        databaseUrl: `postgresql://portal:portal@localhost:5432/${appSlug}?schema=public`,
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
  };
}
