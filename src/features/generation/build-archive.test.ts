import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildArchive } from "./build-archive";
import { buildDeploymentManifest } from "./deployment-manifest";

describe("buildArchive", () => {
  it("builds the FastAPI Azure App Service starter archive", async () => {
    const archive = await buildArchive({
      templateSlug: "python-fastapi",
      appName: "Reports API",
      description: "Reports endpoint",
      hostingTarget: "Azure App Service",
      databaseProvider: "none",
      entraLogin: false,
    });

    expect(archive.filename).toBe("reports-api.zip");
    expect(archive.files["main.py"]).toContain("FastAPI");
    expect(archive.files["requirements.txt"]).toContain("fastapi");
    expect(archive.files["app-portal/deployment-manifest.json"]).toContain(
      "PYTHON|3.14",
    );

    const zip = await JSZip.loadAsync(archive.buffer);
    const workflow =
      (await zip
        .file(".github/workflows/deploy-azure-app-service.yml")
        ?.async("string")) ?? "";

    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain(".python_packages/lib/site-packages");
    expect(zip.file("docs/github-setup.md")).toBeTruthy();
    expect(zip.file("docs/deployment-guide.md")).toBeTruthy();
    expect(zip.file("app-portal/deployment-manifest.json")).toBeTruthy();
    expect(zip.file("next-env.d.ts")).toBeNull();
    expect(zip.file("src/app/layout.tsx")).toBeNull();
  });

  it("creates a zip containing starter files and publishing bundle assets", async () => {
    const input = {
      templateSlug: "web-app",
      appName: "Campus <Beta>",
      description: 'Tracks {housing} and "retention".',
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: true,
    } as const;
    const archive = await buildArchive(input);

    const zip = await JSZip.loadAsync(archive.buffer);
    const generatedPackageJson = JSON.parse(
      (await zip.file("package.json")?.async("string")) ?? "{}",
    ) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const templatePackageJson = JSON.parse(
      await readFile("templates/web-app/files/package.json.template", "utf8"),
    ) as {
      dependencies: Record<string, string>;
    };
    const expectedDeploymentManifest = `${JSON.stringify(
      buildDeploymentManifest(input),
      null,
      2,
    )}\n`;

    expect(archive.filename).toBe("campus-beta.zip");
    expect(zip.file("package.json")).toBeTruthy();
    expect(zip.file("tsconfig.json")).toBeTruthy();
    expect(zip.file("next-env.d.ts")).toBeTruthy();
    expect(zip.file(".gitignore")).toBeTruthy();
    await expect(zip.file(".gitignore")?.async("string")).resolves.toContain(
      "node_modules/",
    );
    await expect(zip.file(".gitignore")?.async("string")).resolves.toContain(
      ".next/",
    );
    await expect(zip.file(".gitignore")?.async("string")).resolves.toContain(
      ".env.local",
    );
    await expect(zip.file("README.md")?.async("string")).resolves.toContain(
      "Campus <Beta>",
    );
    await expect(
      zip.file("package.json")?.async("string"),
    ).resolves.toContain('"build": "next build"');
    await expect(
      zip.file("package.json")?.async("string"),
    ).resolves.toContain('"name": "campus-beta"');
    expect(generatedPackageJson.dependencies.next).toBe(
      templatePackageJson.dependencies.next,
    );
    expect(generatedPackageJson.dependencies.react).toBe(
      templatePackageJson.dependencies.react,
    );
    expect(generatedPackageJson.dependencies["next-auth"]).toBe(
      "^5.0.0-beta.25",
    );
    expect(generatedPackageJson.dependencies["@prisma/client"]).toBe(
      "^6.19.3",
    );
    expect(generatedPackageJson.dependencies.prisma).toBe("^6.19.3");
    expect(generatedPackageJson.scripts.predev).toBe("prisma generate");
    expect(generatedPackageJson.scripts.prebuild).toBe("prisma generate");
    expect(generatedPackageJson.scripts.pretypecheck).toBe("prisma generate");
    expect(generatedPackageJson.scripts.start).toBe(
      "prisma migrate deploy && next start",
    );
    expect(generatedPackageJson.scripts["db:generate"]).toBe(
      "prisma generate",
    );
    expect(generatedPackageJson.scripts["db:deploy"]).toBe(
      "prisma migrate deploy",
    );
    expect(generatedPackageJson.scripts.typecheck).toBe("tsc --noEmit");
    expect(generatedPackageJson.scripts.test).toBe("npm run typecheck");
    await expect(
      zip.file(".env.example")?.async("string"),
    ).resolves.toContain(
      "DATABASE_URL=postgresql://portal:portal@localhost:5432/campus-beta?schema=public",
    );
    await expect(
      zip.file(".env.example")?.async("string"),
    ).resolves.toContain("AUTH_SECRET=replace-me");
    await expect(
      zip.file(".env.example")?.async("string"),
    ).resolves.toContain("AUTH_MICROSOFT_ENTRA_ID_ID=replace-me");
    await expect(
      zip.file(".env.example")?.async("string"),
    ).resolves.toContain(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/replace-me/v2.0",
    );
    await expect(
      zip.file(".env.example")?.async("string"),
    ).resolves.not.toContain("AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID");
    await expect(
      zip.file("src/app/page.tsx")?.async("string"),
    ).resolves.toContain('<h1>{ "Campus <Beta>" }</h1>');
    await expect(
      zip.file("src/app/layout.tsx")?.async("string"),
    ).resolves.toContain('title: "Campus <Beta>"');
    await expect(
      zip.file("src/app/page.tsx")?.async("string"),
    ).resolves.toContain(
      '<p className="lede">{ "Tracks {housing} and \\"retention\\"." }</p>',
    );
    await expect(
      zip.file("src/app/page.tsx")?.async("string"),
    ).resolves.toContain('await signIn("microsoft-entra-id")');
    expect(zip.file("src/auth.ts")).toBeTruthy();
    expect(zip.file("src/lib/app-data.ts")).toBeTruthy();
    expect(zip.file("src/app/api/auth/[...nextauth]/route.ts")).toBeTruthy();
    expect(zip.file("src/app/api/health/route.ts")).toBeTruthy();
    expect(zip.file("prisma/schema.prisma")).toBeTruthy();
    expect(
      zip.file("prisma/migrations/00000000000000_init/migration.sql"),
    ).toBeTruthy();
    await expect(
      zip.file("prisma/schema.prisma")?.async("string"),
    ).resolves.toContain("model AppSetting");
    await expect(
      zip
        .file("prisma/migrations/00000000000000_init/migration.sql")
        ?.async("string"),
    ).resolves.toContain('CREATE TABLE "AppSetting"');
    await expect(
      zip.file("src/lib/app-data.ts")?.async("string"),
    ).resolves.toContain("getAppDataStatus");
    await expect(
      zip.file("src/lib/app-data.ts")?.async("string"),
    ).resolves.toContain("Ready for app data");
    await expect(
      zip.file("src/app/page.tsx")?.async("string"),
    ).resolves.toContain("getAppDataStatus");
    await expect(
      zip.file("src/app/api/health/route.ts")?.async("string"),
    ).resolves.toContain('app: "Campus <Beta>"');
    await expect(zip.file("README.md")?.async("string")).resolves.toContain(
      "portal-managed GitHub repository",
    );
    await expect(zip.file("README.md")?.async("string")).resolves.not.toContain(
      "Create a new GitHub repository for this project.",
    );
    expect(zip.file("docs/github-setup.md")).toBeTruthy();
    expect(zip.file("docs/deployment-guide.md")).toBeTruthy();
    expect(zip.file("docs/publishing/azure-app-service.md")).toBeTruthy();
    expect(zip.file("docs/publishing/lessons-learned.md")).toBeTruthy();
    expect(zip.file("app-portal/deployment-manifest.json")).toBeTruthy();
    expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml"),
    ).toBeTruthy();
    expect(zip.file(".codex/skills/publish-to-azure/SKILL.md")).toBeTruthy();
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toBe(expectedDeploymentManifest);
    await expect(
      zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async("string"),
    ).resolves.toContain("Publish to Azure");
    await expect(
      zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async("string"),
    ).resolves.toContain("DATABASE_URL");
    await expect(
      zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async("string"),
    ).resolves.toContain("Azure Database for PostgreSQL flexible server");
    await expect(
      zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async("string"),
    ).resolves.toContain("Set the App Service `DATABASE_URL` app setting");
    await expect(
      zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async("string"),
    ).resolves.toContain("Microsoft Entra login is configured");
    await expect(
      zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async("string"),
    ).resolves.toContain("AUTH_MICROSOFT_ENTRA_ID_ID");
    await expect(
      zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async("string"),
    ).resolves.toContain("redirect URI");
    await expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml")?.async(
        "string",
      ),
    ).resolves.toContain("azure/webapps-deploy");
    await expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml")?.async(
        "string",
      ),
    ).resolves.toContain(
      "AZURE_WEBAPP_NAME: ${{ secrets.AZURE_WEBAPP_NAME }}",
    );
    await expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml")?.async(
        "string",
      ),
    ).resolves.toContain("if [ -f package-lock.json ]; then");
    await expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml")?.async(
        "string",
      ),
    ).resolves.toContain("npm install");
    await expect(
      zip.file(".github/workflows/deploy-azure-app-service.yml")?.async(
        "string",
      ),
    ).resolves.toContain("node-version: 24");
    await expect(
      zip.file("package.json")?.async("string"),
    ).resolves.toContain('"node": ">=24"');
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toContain('"framework": "nextjs"');
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toContain('"runtimeStack": "NODE|24-lts"');
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toContain('"resourceModel": "shared-portal-managed"');
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toContain('"postgresServer": "psql-cu-apps-published"');
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toContain(
      '"webAppNamePattern": "app-campus-beta-<short-request-id>"',
    );
    await expect(
      zip.file("app-portal/deployment-manifest.json")?.async("string"),
    ).resolves.toContain('"databaseUrlAppSetting": "DATABASE_URL"');
    await expect(
      zip.file("docs/publishing/azure-app-service.md")?.async("string"),
    ).resolves.toContain("Azure Database for PostgreSQL");
    await expect(
      zip.file("docs/publishing/azure-app-service.md")?.async("string"),
    ).resolves.toContain("DATABASE_URL");
    await expect(
      zip.file("README.md")?.async("string"),
    ).resolves.toContain("Persistent app data is already wired in");
    expect(archive.files["README.md"]).toContain("Campus <Beta>");
    expect(archive.files["app-portal/deployment-manifest.json"]).toBe(
      expectedDeploymentManifest,
    );
    await expect(zip.file("README.md")?.async("string")).resolves.toBe(
      archive.files["README.md"],
    );

    const renderedWorkflow = await zip
      .file(".github/workflows/deploy-azure-app-service.yml")!
      .async("string");

    expect(renderedWorkflow).toContain("on:\n  workflow_dispatch:");
    expect(renderedWorkflow).not.toContain("push:\n    branches:");
    expect(renderedWorkflow).toContain(
      "AZURE_WEBAPP_NAME: ${{ secrets.AZURE_WEBAPP_NAME }}",
    );
    expect(renderedWorkflow).toContain(
      "for file in package-lock.json next.config.js next.config.mjs next.config.ts next-env.d.ts prisma.config.ts; do",
    );
    expect(renderedWorkflow).toContain("for dir in public prisma; do");
    expect(renderedWorkflow).not.toContain(
      "cp package.json package-lock.json next.config.ts next-env.d.ts prisma.config.ts",
    );

    const templateManifest = JSON.parse(
      await readFile("templates/web-app/template.json", "utf8"),
    ) as { generatedFiles: string[]; generatedOverrides?: string[] };

    expect(templateManifest.generatedFiles.sort()).toEqual([
      "app-portal/deployment-manifest.json",
      "docs/deployment-guide.md",
      "docs/github-setup.md",
    ]);
    expect(templateManifest.generatedOverrides?.sort()).toEqual([
      ".codex/skills/publish-to-azure/SKILL.md",
      ".env.example",
      "README.md",
      "docs/publishing/azure-app-service.md",
      "docs/publishing/lessons-learned.md",
      "package.json",
      "src/app/page.tsx",
      "src/lib/app-data.ts",
    ]);

    for (const generatedFile of templateManifest.generatedFiles) {
      expect(zip.file(generatedFile)).toBeTruthy();
    }

    for (const generatedOverride of templateManifest.generatedOverrides ?? []) {
      expect(zip.file(generatedOverride)).toBeTruthy();
    }

    expect(templateManifest.entryFiles).toEqual(
      expect.arrayContaining([
        "package.json.template",
        ".gitignore.template",
        "tsconfig.json.template",
        "next-env.d.ts",
        ".github/workflows/deploy-azure-app-service.yml.template",
        ".codex/skills/publish-to-azure/SKILL.md.template",
        "docs/publishing/azure-app-service.md.template",
        "docs/publishing/lessons-learned.md.template",
        "src/app/layout.tsx.template",
        "src/app/page.tsx.template",
        "src/lib/app-data.ts.template",
        "src/app/api/health/route.ts.template",
      ]),
    );
    expect(templateManifest.entryFiles).not.toEqual(
      expect.arrayContaining([
        "prisma/schema.prisma.template",
        "prisma/migrations/00000000000000_init/migration.sql",
        "src/auth.ts.template",
        "src/app/api/auth/[...nextauth]/route.ts.template",
      ]),
    );
    expect(templateManifest).toMatchObject({
      conditionalEntryFiles: {
        databasePostgresql: [
          "prisma/schema.prisma.template",
          "prisma/migrations/00000000000000_init/migration.sql",
        ],
        entraLogin: [
          "src/app/api/auth/[...nextauth]/route.ts.template",
          "src/auth.ts.template",
        ],
      },
    });
  });

  it('falls back to "app.zip" when the app name normalizes to an empty slug', async () => {
    const archive = await buildArchive({
      templateSlug: "web-app",
      appName: "!!!",
      description: "Fallback filename coverage.",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: true,
    });

    expect(archive.filename).toBe("app.zip");
  });

  it("ships feature-aware docs when generated without a database", async () => {
    const archive = await buildArchive({
      templateSlug: "web-app",
      appName: "Campus Hub",
      description: "Student services portal",
      hostingTarget: "Azure App Service",
      databaseProvider: "none",
      entraLogin: false,
    });
    const zip = await JSZip.loadAsync(archive.buffer);
    const azurePublishingDoc =
      (await zip.file("docs/publishing/azure-app-service.md")?.async(
        "string",
      )) ?? "";
    const lessonsLearnedDoc =
      (await zip.file("docs/publishing/lessons-learned.md")?.async(
        "string",
      )) ?? "";
    const readme = (await zip.file("README.md")?.async("string")) ?? "";
    const publishSkill =
      (await zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async(
        "string",
      )) ?? "";
    const packageJson = JSON.parse(
      (await zip.file("package.json")?.async("string")) ?? "{}",
    ) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };

    expect(zip.file("prisma/schema.prisma")).toBeNull();
    expect(
      zip.file("prisma/migrations/00000000000000_init/migration.sql"),
    ).toBeNull();
    expect(zip.file("src/app/api/auth/[...nextauth]/route.ts")).toBeNull();
    expect(zip.file("src/auth.ts")).toBeNull();
    await expect(
      zip.file("src/app/page.tsx")?.async("string"),
    ).resolves.not.toContain("@/auth");
    await expect(
      zip.file("src/app/page.tsx")?.async("string"),
    ).resolves.not.toContain("getAppDataStatus");
    await expect(
      zip.file("src/lib/app-data.ts")?.async("string"),
    ).resolves.not.toContain("@prisma/client");
    expect(packageJson.dependencies["@prisma/client"]).toBeUndefined();
    expect(packageJson.dependencies.prisma).toBeUndefined();
    expect(packageJson.dependencies["next-auth"]).toBeUndefined();
    expect(packageJson.scripts.predev).toBeUndefined();
    expect(packageJson.scripts.prebuild).toBeUndefined();
    expect(packageJson.scripts.pretypecheck).toBeUndefined();
    expect(packageJson.scripts.start).toBe("next start");
    await expect(
      zip.file(".env.example")?.async("string"),
    ).resolves.not.toContain("DATABASE_URL");
    await expect(
      zip.file(".env.example")?.async("string"),
    ).resolves.not.toContain("AUTH_");
    expect(azurePublishingDoc).toContain(
      "This app was generated without a database.",
    );
    expect(azurePublishingDoc).toContain(
      "This app was generated without built-in login.",
    );
    expect(azurePublishingDoc).not.toContain("Azure Database for PostgreSQL");
    expect(azurePublishingDoc).not.toContain("DATABASE_URL");
    expect(lessonsLearnedDoc).toContain(
      "This app was generated without a database.",
    );
    expect(lessonsLearnedDoc).not.toContain("DATABASE_URL");
    expect(readme).not.toContain("DATABASE_URL");
    expect(readme).not.toContain("Azure PostgreSQL");
    expect(readme).not.toContain("Persistent app data is already wired in");
    expect(publishSkill).toContain(
      "This app was generated without a database.",
    );
    expect(publishSkill).toContain(
      "This app was generated without built-in login.",
    );
    expect(publishSkill).toContain(
      "Create or verify the Azure App Service app described by the manifest.",
    );
    expect(publishSkill).not.toContain("PostgreSQL");
    expect(publishSkill).not.toContain("DATABASE_URL");
    expect(publishSkill).not.toContain("AUTH_MICROSOFT_ENTRA_ID_ID");
    expect(publishSkill).not.toContain("AUTH_MICROSOFT_ENTRA_ID_SECRET");
    expect(publishSkill).not.toContain("AUTH_MICROSOFT_ENTRA_ID_ISSUER");
  });

  it("keeps README database and login guidance independent for mixed feature selections", async () => {
    const databaseOnlyArchive = await buildArchive({
      templateSlug: "web-app",
      appName: "Database Only",
      description: "Database without login.",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: false,
    });
    const authOnlyArchive = await buildArchive({
      templateSlug: "web-app",
      appName: "Auth Only",
      description: "Login without database.",
      hostingTarget: "Azure App Service",
      databaseProvider: "none",
      entraLogin: true,
    });
    const databaseOnlyZip = await JSZip.loadAsync(databaseOnlyArchive.buffer);
    const authOnlyZip = await JSZip.loadAsync(authOnlyArchive.buffer);
    const databaseOnlyReadme =
      (await databaseOnlyZip.file("README.md")?.async("string")) ?? "";
    const authOnlyReadme =
      (await authOnlyZip.file("README.md")?.async("string")) ?? "";

    expect(databaseOnlyArchive.files["README.md"]).toBe(databaseOnlyReadme);
    expect(authOnlyArchive.files["README.md"]).toBe(authOnlyReadme);
    expect(databaseOnlyReadme).toContain("Azure PostgreSQL");
    expect(databaseOnlyReadme).toContain(
      "Persistent app data is already wired in",
    );
    expect(databaseOnlyReadme).toContain(
      "This app was generated without built-in login.",
    );
    expect(databaseOnlyReadme).not.toContain("production auth settings");
    expect(databaseOnlyReadme).not.toContain("Microsoft Entra login.");

    expect(authOnlyReadme).toContain(
      "This app is configured for Microsoft Entra login.",
    );
    expect(authOnlyReadme).toContain("production auth settings");
    expect(authOnlyReadme).toContain(
      "This app was generated without a database.",
    );
    expect(authOnlyReadme).not.toContain("DATABASE_URL");
    expect(authOnlyReadme).not.toContain("Azure PostgreSQL");
    expect(authOnlyReadme).not.toContain(
      "Persistent app data is already wired in",
    );
  });

  it("rejects unsupported hosting targets for the Azure-first publishing bundle", async () => {
    await expect(
      buildArchive({
        templateSlug: "web-app",
        appName: "Campus Hub",
        description: "Unsupported target coverage.",
        hostingTarget: "Vercel",
        databaseProvider: "postgresql",
        entraLogin: true,
      }),
    ).rejects.toThrow(
      'Deployment manifest generation requires "Azure App Service" hosting, received "Vercel".',
    );
  });
});
