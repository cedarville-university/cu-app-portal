import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/templates/catalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/templates/catalog")>();

  return {
    ...actual,
    getTemplateBySlug: (templateSlug: string) => {
      if (templateSlug === "override-test") {
        return {
          id: "override-test",
          slug: "override-test",
          name: "Override Test",
          description: "Fixture template for override rendering tests.",
          decisionSummary: "Fixture only.",
          bestFor: ["Testing"],
          hostingTarget: "Azure App Service",
          appServiceRuntime: {
            family: "node",
            framework: "nextjs",
            displayName: "Next.js on Node 24",
            azureRuntimeStack: "NODE|24-lts",
            startupCommand: "npm start",
            workflowFileName: "deploy-azure-app-service.yml",
          },
          features: {
            database: {
              mode: "optional",
              providerOptions: ["postgresql"],
              defaultProvider: "none",
            },
            entraLogin: {
              mode: "optional",
              defaultEnabled: false,
            },
          },
          version: "1.0.0",
          status: "ACTIVE",
          fields: [],
        };
      }

      return actual.getTemplateBySlug(templateSlug);
    },
  };
});

afterEach(() => {
  vi.resetModules();
});

async function loadBuildSourceSnapshot() {
  return (await import("./build-source-snapshot")).buildSourceSnapshot;
}

describe("buildSourceSnapshot", () => {
  it("keeps current web-app database and Entra files when both features are selected", async () => {
    const buildSourceSnapshot = await loadBuildSourceSnapshot();
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
    const buildSourceSnapshot = await loadBuildSourceSnapshot();
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

  it("generates FastAPI source with PostgreSQL and Entra feature content", async () => {
    const buildSourceSnapshot = await loadBuildSourceSnapshot();
    const files = await buildSourceSnapshot({
      templateSlug: "python-fastapi",
      appName: "Reports API",
      description: "Department reports",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: true,
    });

    expect(files["main.py"]).toContain("psycopg.connect");
    expect(files["main.py"]).toContain('@app.get("/api/data-status")');
    expect(files["main.py"]).toContain('@app.get("/auth/callback")');
    expect(files[".env.example"]).toContain("DATABASE_URL=");
    expect(files[".env.example"]).toContain("AUTH_MICROSOFT_ENTRA_ID_ID=");
    expect(files["requirements.txt"]).toContain("psycopg[binary]");
    expect(files["requirements.txt"]).toContain("authlib");
    expect(files["requirements.txt"]).toContain("itsdangerous");
    expect(files["package.json"]).toBeUndefined();
  });

  it("does not render entry files whose output paths are generated overrides", async () => {
    const templateRoot = path.join(process.cwd(), "templates", "override-test");
    await rm(templateRoot, { recursive: true, force: true });

    try {
      await mkdir(path.join(templateRoot, "files"), { recursive: true });
      await writeFile(
        path.join(templateRoot, "template.json"),
        JSON.stringify(
          {
            slug: "override-test",
            version: "1.0.0",
            entryFiles: ["README.md.template", "plain.txt.template"],
            generatedFiles: [],
            generatedOverrides: ["README.md"],
          },
          null,
          2,
        ),
      );
      await writeFile(
        path.join(templateRoot, "files", "plain.txt.template"),
        "Rendered {{APP_NAME}}",
      );
      const buildSourceSnapshot = await loadBuildSourceSnapshot();

      const files = await buildSourceSnapshot({
        templateSlug: "override-test",
        appName: "Campus Hub",
        description: "Student services portal",
        hostingTarget: "Azure App Service",
        databaseProvider: "none",
        entraLogin: false,
      });

      expect(files["plain.txt"]).toBe("Rendered Campus Hub");
      expect(files["README.md"]).toContain("# Campus Hub");
    } finally {
      await rm(templateRoot, { recursive: true, force: true });
    }
  });
});
