import { describe, expect, it, vi } from "vitest";
import { PUBLISHING_BUNDLE_PATHS } from "./compatibility";
import { verifyImportedPublishReadiness } from "./publish-readiness";

const readyPackageJson = JSON.stringify({
  scripts: {
    build: "next build",
    start: "next start",
  },
  dependencies: {
    next: "15.5.15",
  },
  engines: {
    node: ">=24",
  },
});

const fastApiRuntime = {
  family: "python",
  framework: "fastapi",
  displayName: "Python 3.14 / FastAPI",
  azureRuntimeStack: "PYTHON|3.14",
  startupCommand: "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
  workflowFileName: "deploy-azure-app-service.yml",
};

const fastApiManifest = JSON.stringify({
  templateSlug: "imported-web-app",
  runtime: fastApiRuntime,
});

const httpServerRuntime = {
  family: "python",
  framework: "http-server",
  displayName: "Python 3.14 / http.server",
  azureRuntimeStack: "PYTHON|3.14",
  startupCommand: "python app-portal/http_server_start.py",
  workflowFileName: "deploy-azure-app-service.yml",
};

const httpServerManifest = JSON.stringify({
  templateSlug: "imported-web-app",
  runtime: httpServerRuntime,
});

const httpServerStartPath = "app-portal/http_server_start.py";

function readRequestedFiles(repositoryFiles: Record<string, string>) {
  return vi.fn().mockImplementation(({ paths }: { paths: string[] }) =>
    Object.fromEntries(
      paths
        .filter((path) => Object.prototype.hasOwnProperty.call(repositoryFiles, path))
        .map((path) => [path, repositoryFiles[path]]),
    ),
  );
}

describe("verifyImportedPublishReadiness", () => {
  it("reads package.json and publishing bundle paths from the default branch", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": readyPackageJson,
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [path, "content"]),
        ),
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({
      ready: true,
      missingPaths: [],
      packageIssues: [],
      runtime: {
        family: "node",
        framework: "nextjs",
        displayName: "Node.js 24 / Next.js",
        azureRuntimeStack: "NODE|24-lts",
        startupCommand: "npm start",
        workflowFileName: "deploy-azure-app-service.yml",
      },
      databaseProvider: "postgresql",
      entraLogin: true,
    });

    expect(github.readRepositoryTextFiles).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      ref: "main",
      paths: [
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lock",
        "bun.lockb",
        "pnpm-workspace.yaml",
        "turbo.json",
        "lerna.json",
        "nx.json",
        "requirements.txt",
        "pyproject.toml",
        "main.py",
        "app.py",
        "index.html",
        httpServerStartPath,
        ...PUBLISHING_BUNDLE_PATHS,
      ],
    });
  });

  it("verifies FastAPI publishing readiness without package.json", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "requirements.txt": [
          "fastapi==0.115.0",
          "uvicorn==0.32.0",
          "gunicorn==23.0.0",
        ].join("\n"),
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [
            path,
            path === "app-portal/deployment-manifest.json"
              ? fastApiManifest
              : "content",
          ]),
        ),
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "reports-api",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toMatchObject({
      ready: true,
      missingPaths: [],
      packageIssues: [],
      runtime: {
        family: "python",
        framework: "fastapi",
        azureRuntimeStack: "PYTHON|3.14",
      },
      databaseProvider: "none",
      entraLogin: false,
    });
  });

  it("verifies http.server publishing readiness without package or Python app files", async () => {
    const github = {
      readRepositoryTextFiles: readRequestedFiles({
        "index.html": "<h1>Static site</h1>",
        [httpServerStartPath]: "wrapper",
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [
            path,
            path === "app-portal/deployment-manifest.json"
              ? httpServerManifest
              : "content",
          ]),
        ),
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "static-site",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({
      ready: true,
      missingPaths: [],
      packageIssues: [],
      runtime: httpServerRuntime,
      databaseProvider: "none",
      entraLogin: false,
    });

    expect(github.readRepositoryTextFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        paths: expect.arrayContaining(["index.html"]),
      }),
    );
  });

  it("requires the Python start wrapper for http.server readiness", async () => {
    const github = {
      readRepositoryTextFiles: readRequestedFiles({
        "index.html": "<h1>Static site</h1>",
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [
            path,
            path === "app-portal/deployment-manifest.json"
              ? httpServerManifest
              : "content",
          ]),
        ),
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "static-site",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toMatchObject({
      ready: false,
      missingPaths: [httpServerStartPath],
      packageIssues: [],
      runtime: httpServerRuntime,
      databaseProvider: "none",
      entraLogin: false,
    });
  });

  it("falls back to an http.server manifest runtime while preserving source issues", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        [httpServerStartPath]: "wrapper",
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [
            path,
            path === "app-portal/deployment-manifest.json"
              ? httpServerManifest
              : "content",
          ]),
        ),
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "static-site",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({
      ready: false,
      missingPaths: [],
      packageIssues: [
        "Repository must be a root Next.js, FastAPI, or Python static app for portal-managed Azure publishing.",
      ],
      runtime: httpServerRuntime,
      databaseProvider: "none",
      entraLogin: false,
    });
  });

  it("reports missing publishing bundle paths", async () => {
    const [firstBundlePath, secondBundlePath, ...presentBundlePaths] =
      PUBLISHING_BUNDLE_PATHS;
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue(
        {
          "package.json": readyPackageJson,
          ...Object.fromEntries(
            presentBundlePaths.map((path) => [path, "content"]),
          ),
        },
      ),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({
      ready: false,
      missingPaths: [firstBundlePath, secondBundlePath],
      packageIssues: [],
      runtime: {
        family: "node",
        framework: "nextjs",
        displayName: "Node.js 24 / Next.js",
        azureRuntimeStack: "NODE|24-lts",
        startupCommand: "npm start",
        workflowFileName: "deploy-azure-app-service.yml",
      },
      databaseProvider: "postgresql",
      entraLogin: true,
    });
  });

  it("returns manifest runtime fallback when source runtime cannot be detected", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [
            path,
            path === "app-portal/deployment-manifest.json"
              ? fastApiManifest
              : "content",
          ]),
        ),
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({
      ready: false,
      missingPaths: [],
      packageIssues: [
        "Repository must be a root Next.js, FastAPI, or Python static app for portal-managed Azure publishing.",
      ],
      runtime: fastApiRuntime,
      databaseProvider: "none",
      entraLogin: false,
    });
  });

  it("reports incomplete package.json additions as not ready", async () => {
    const github = {
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": JSON.stringify({
          scripts: { build: "next build" },
          dependencies: { next: "15.5.15" },
        }),
        ...Object.fromEntries(
          PUBLISHING_BUNDLE_PATHS.map((path) => [path, "content"]),
        ),
      }),
    };

    await expect(
      verifyImportedPublishReadiness({
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        github,
      }),
    ).resolves.toEqual({
      ready: false,
      missingPaths: [],
      packageIssues: [
        'package.json is missing a start script; the portal can add "next start".',
        'package.json is missing engines.node; the portal can add ">=24".',
      ],
      runtime: {
        family: "node",
        framework: "nextjs",
        displayName: "Node.js 24 / Next.js",
        azureRuntimeStack: "NODE|24-lts",
        startupCommand: "npm start",
        workflowFileName: "deploy-azure-app-service.yml",
      },
      databaseProvider: "postgresql",
      entraLogin: true,
    });
  });
});
