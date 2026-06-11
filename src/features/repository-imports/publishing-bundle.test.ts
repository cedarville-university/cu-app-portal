import { describe, expect, it } from "vitest";
import { IMPORTED_NEXT_RUNTIME } from "./compatibility";
import { planPublishingBundle } from "./publishing-bundle";

const FASTAPI_RUNTIME = {
  family: "python",
  framework: "fastapi",
  displayName: "Python 3.14 / FastAPI",
  azureRuntimeStack: "PYTHON|3.14",
  startupCommand:
    "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
  workflowFileName: "deploy-azure-app-service.yml",
} as const;

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
      runtime: FASTAPI_RUNTIME,
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

  it("extracts FastAPI dependencies from project pyproject dependencies", () => {
    const plan = planPublishingBundle({
      appName: "Reports API",
      repositoryOwner: "cedarville-it",
      repositoryName: "reports-api",
      runtime: FASTAPI_RUNTIME,
      files: {
        "pyproject.toml": [
          "[project]",
          "dependencies = [",
          '  "fastapi==0.115.0",',
          '  "gunicorn==23.0.0",',
          '  "uvicorn[standard]==0.30.0",',
          "]",
          "",
        ].join("\n"),
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      },
    });

    const workflow =
      plan.filesToWrite[".github/workflows/deploy-azure-app-service.yml"];

    expect(plan.filesToWrite["package.json"]).toBeUndefined();
    expect(workflow).toContain("tomllib");
    expect(workflow).toContain("project\", {}).get(\"dependencies\"");
    expect(workflow).toContain("pyproject-requirements.txt");
    expect(workflow).toContain(
      "python -m pip install -r pyproject-requirements.txt",
    );
    expect(workflow).not.toContain("python -m pip install . --target");
  });

  it("extracts FastAPI dependencies from Poetry pyproject tables", () => {
    const plan = planPublishingBundle({
      appName: "Reports API",
      repositoryOwner: "cedarville-it",
      repositoryName: "reports-api",
      runtime: FASTAPI_RUNTIME,
      files: {
        "pyproject.toml": [
          "[tool.poetry.dependencies]",
          'python = "^3.14"',
          'fastapi = "^0.115.0"',
          'gunicorn = "^23.0.0"',
          'uvicorn = { version = "^0.30.0", extras = ["standard"] }',
          "",
        ].join("\n"),
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      },
    });

    const workflow =
      plan.filesToWrite[".github/workflows/deploy-azure-app-service.yml"];

    expect(workflow).toContain("poetry_dependencies");
    expect(workflow).toContain("normalized_name.lower() == \"python\"");
    expect(workflow).toContain("pyproject-requirements.txt");
    expect(workflow).not.toContain("python -m pip install . --target");
  });
});
