import { describe, expect, it } from "vitest";
import { IMPORTED_NEXT_RUNTIME } from "./compatibility";
import { planPublishingBundle } from "./publishing-bundle";

describe("planPublishingBundle", () => {
  it("adds publishing files and narrow package.json changes", () => {
    const plan = planPublishingBundle({
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      runtime: IMPORTED_NEXT_RUNTIME,
      files: {
        "package.json": JSON.stringify(
          {
            name: "campus-dashboard",
            scripts: { build: "next build" },
            dependencies: { next: "15.5.15" },
          },
          null,
          2,
        ),
      },
    });

    expect(Object.keys(plan.filesToWrite)).toEqual([
      "package.json",
      ".github/workflows/deploy-azure-app-service.yml",
      ".codex/skills/publish-to-azure/SKILL.md",
      "docs/publishing/azure-app-service.md",
      "docs/publishing/lessons-learned.md",
      "app-portal/deployment-manifest.json",
    ]);
    expect(JSON.parse(plan.filesToWrite["package.json"])).toMatchObject({
      scripts: { build: "next build", start: "next start" },
      engines: { node: ">=24" },
    });
    expect(
      JSON.parse(plan.filesToWrite["app-portal/deployment-manifest.json"]),
    ).toMatchObject({
      templateSlug: "imported-web-app",
      runtime: {
        family: "node",
        framework: "nextjs",
        azureRuntimeStack: "NODE|24-lts",
      },
      defaults: { githubRepository: "campus-dashboard" },
    });
  });

  it("does not rewrite package.json when start and engines already exist", () => {
    const packageJson = JSON.stringify(
      {
        name: "campus-dashboard",
        scripts: { build: "next build", start: "next start" },
        dependencies: { next: "15.5.15" },
        engines: { node: ">=24" },
      },
      null,
      2,
    );

    const plan = planPublishingBundle({
      appName: "Campus Dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      runtime: IMPORTED_NEXT_RUNTIME,
      files: { "package.json": packageJson },
    });

    expect(plan.filesToWrite["package.json"]).toBeUndefined();
  });

  it("rejects existing target publishing files", () => {
    expect(() =>
      planPublishingBundle({
        appName: "Campus Dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        runtime: IMPORTED_NEXT_RUNTIME,
        files: {
          "package.json": JSON.stringify({
            scripts: { build: "next build", start: "next start" },
            dependencies: { next: "15.5.15" },
          }),
          ".github/workflows/deploy-azure-app-service.yml": "name: Custom",
        },
      }),
    ).toThrow(".github/workflows/deploy-azure-app-service.yml already exists");
  });

  it("adds FastAPI publishing files without package.json rewrites", () => {
    const plan = planPublishingBundle({
      appName: "Reports API",
      repositoryOwner: "cedarville-it",
      repositoryName: "reports-api",
      runtime: {
        family: "python",
        framework: "fastapi",
        displayName: "Python 3.14 / FastAPI",
        azureRuntimeStack: "PYTHON|3.14",
        startupCommand:
          "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
        workflowFileName: "deploy-azure-app-service.yml",
      },
      files: {
        "requirements.txt":
          "fastapi==0.115.0\ngunicorn==23.0.0\nuvicorn[standard]==0.30.0\n",
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      },
    });

    expect(plan.filesToWrite["package.json"]).toBeUndefined();
    expect(
      plan.filesToWrite[".github/workflows/deploy-azure-app-service.yml"],
    ).toContain("Setup Python");
    expect(
      plan.filesToWrite[".github/workflows/deploy-azure-app-service.yml"],
    ).toContain(".python_packages/lib/site-packages");
    expect(
      plan.filesToWrite[".github/workflows/deploy-azure-app-service.yml"],
    ).toContain("pyproject.toml");
    const manifest = JSON.parse(
      plan.filesToWrite["app-portal/deployment-manifest.json"],
    );

    expect(manifest).toMatchObject({
      templateSlug: "imported-web-app",
      runtime: {
        family: "python",
        framework: "fastapi",
        azureRuntimeStack: "PYTHON|3.14",
      },
      defaults: {
        githubRepository: "reports-api",
      },
    });
    expect(manifest.defaults.appSettings).toBeUndefined();
    expect(manifest.applicationSettings).not.toContain("DATABASE_URL");
    expect(manifest.applicationSettings).not.toContain("AUTH_SECRET");
    expect(plan.filesToWrite["docs/publishing/azure-app-service.md"]).toContain(
      "Python 3.14 / FastAPI",
    );
  });
});
