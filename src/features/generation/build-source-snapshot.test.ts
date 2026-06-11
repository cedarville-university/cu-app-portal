import { describe, expect, it } from "vitest";
import { buildSourceSnapshot } from "./build-source-snapshot";

describe("buildSourceSnapshot", () => {
  it("keeps current web-app database and Entra files when both features are selected", async () => {
    const files = await buildSourceSnapshot({
      templateSlug: "web-app",
      appName: "Campus Hub",
      description: "Student services portal",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: true,
    });

    expect(files["prisma/schema.prisma"]).toContain(
      'provider = "postgresql"',
    );
    expect(files["prisma/schema.prisma"]).toContain("model AppSetting");
    expect(
      files["prisma/migrations/00000000000000_init/migration.sql"],
    ).toContain('CREATE TABLE "AppSetting"');
    expect(files["src/app/api/auth/[...nextauth]/route.ts"]).toContain(
      "handlers",
    );
    expect(files["src/auth.ts"]).toContain("MicrosoftEntraID");
    expect(files["app-portal/deployment-manifest.json"]).toContain(
      "DATABASE_URL",
    );
    expect(files[".env.example"]).toContain("DATABASE_URL");
    expect(files[".env.example"]).toContain("AUTH_MICROSOFT_ENTRA_ID_ID");
    expect(files["package.json"]).toContain("prisma migrate deploy");
    expect(files["src/app/page.tsx"]).toContain(
      'await signIn("microsoft-entra-id")',
    );
    expect(files["src/app/page.tsx"]).toContain("getAppDataStatus");
    expect(files["src/lib/app-data.ts"]).toContain("PrismaClient");
  });

  it("omits web-app database and auth files when features are disabled", async () => {
    const files = await buildSourceSnapshot({
      templateSlug: "web-app",
      appName: "Campus Hub",
      description: "Student services portal",
      hostingTarget: "Azure App Service",
      databaseProvider: "none",
      entraLogin: false,
    });

    expect(files["prisma/schema.prisma"]).toBeUndefined();
    expect(
      files["prisma/migrations/00000000000000_init/migration.sql"],
    ).toBeUndefined();
    expect(files["src/app/api/auth/[...nextauth]/route.ts"]).toBeUndefined();
    expect(files["src/auth.ts"]).toBeUndefined();
    expect(files["app-portal/deployment-manifest.json"]).not.toContain(
      "DATABASE_URL",
    );
    expect(files["app-portal/deployment-manifest.json"]).not.toContain(
      "AUTH_MICROSOFT_ENTRA_ID_ID",
    );
    expect(files[".env.example"]).not.toContain("DATABASE_URL");
    expect(files[".env.example"]).not.toContain("AUTH_");
    expect(files["package.json"]).not.toContain("prisma");
    expect(files["package.json"]).not.toContain("next-auth");
    expect(files["src/app/page.tsx"]).not.toContain("@/auth");
    expect(files["src/app/page.tsx"]).not.toContain("getAppDataStatus");
    expect(files["src/lib/app-data.ts"]).not.toContain("@prisma/client");
  });
});
