import { describe, expect, it, vi } from "vitest";
import { prepareImportedRepository } from "./prepare-repository";

const files = {
  "package.json": JSON.stringify({
    scripts: { build: "next build" },
    dependencies: { next: "15.5.15" },
  }),
};

const httpServerRuntime = {
  family: "python",
  framework: "http-server",
  displayName: "Python 3.14 / http.server",
  azureRuntimeStack: "PYTHON|3.14",
  startupCommand: "python app-portal/http_server_start.py",
  workflowFileName: "deploy-azure-app-service.yml",
};

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

describe("prepareImportedRepository", () => {
  it("commits publishing additions directly", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: vi.fn().mockResolvedValue(files),
      commitFiles: vi.fn().mockResolvedValue({ commitSha: "commit-sha" }),
      createPullRequestWithFiles: vi.fn(),
    };

    await expect(
      prepareImportedRepository({
        appName: "Campus Dashboard",
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        mode: "DIRECT_COMMIT",
        github,
      }),
    ).resolves.toMatchObject({
      status: "COMMITTED",
      commitSha: "commit-sha",
      pullRequestUrl: null,
    });
    expect(github.readRepositoryTextFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: "head-sha",
        paths: expect.arrayContaining([
          "bun.lock",
          "pnpm-workspace.yaml",
          "turbo.json",
          "lerna.json",
          "nx.json",
        ]),
      }),
    );
    expect(github.commitFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "main",
        message: "Add Azure publishing support",
        expectedHeadSha: "head-sha",
      }),
    );
  });

  it("commits FastAPI publishing additions directly", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "requirements.txt":
          "fastapi==0.115.0\nuvicorn[standard]==0.30.0\ngunicorn==23.0.0\n",
        "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      }),
      commitFiles: vi.fn().mockResolvedValue({ commitSha: "commit-sha" }),
      createPullRequestWithFiles: vi.fn(),
    };

    await expect(
      prepareImportedRepository({
        appName: "Reports API",
        owner: "cedarville-it",
        name: "reports-api",
        defaultBranch: "main",
        mode: "DIRECT_COMMIT",
        github,
      }),
    ).resolves.toMatchObject({
      status: "COMMITTED",
      commitSha: "commit-sha",
      pullRequestUrl: null,
      runtime: {
        family: "python",
        framework: "fastapi",
      },
      databaseProvider: "none",
      entraLogin: false,
    });
    expect(github.readRepositoryTextFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        paths: expect.arrayContaining([
          "requirements.txt",
          "pyproject.toml",
          "main.py",
          "app.py",
        ]),
      }),
    );
    expect(github.commitFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.objectContaining({
          ".github/workflows/deploy-azure-app-service.yml":
            expect.stringContaining("Setup Python"),
        }),
      }),
    );
  });

  it("commits http.server publishing additions directly", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: readRequestedFiles({
        "index.html": "<h1>Static site</h1>",
      }),
      commitFiles: vi.fn().mockResolvedValue({ commitSha: "commit-sha" }),
      createPullRequestWithFiles: vi.fn(),
    };

    await expect(
      prepareImportedRepository({
        appName: "Static Site",
        owner: "cedarville-it",
        name: "static-site",
        defaultBranch: "main",
        mode: "DIRECT_COMMIT",
        github,
      }),
    ).resolves.toMatchObject({
      status: "COMMITTED",
      commitSha: "commit-sha",
      pullRequestUrl: null,
      runtime: httpServerRuntime,
      databaseProvider: "none",
      entraLogin: false,
    });
    expect(github.readRepositoryTextFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        paths: expect.arrayContaining(["index.html"]),
      }),
    );
    expect(github.commitFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.objectContaining({
          [httpServerStartPath]: expect.stringContaining("http.server"),
          "app-portal/deployment-manifest.json": expect.stringContaining(
            '"framework": "http-server"',
          ),
        }),
      }),
    );
  });

  it("blocks direct http.server commits when the Python start wrapper exists", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: readRequestedFiles({
        "index.html": "<h1>Static site</h1>",
        [httpServerStartPath]: "custom wrapper",
      }),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn(),
    };

    await expect(
      prepareImportedRepository({
        appName: "Static Site",
        owner: "cedarville-it",
        name: "static-site",
        defaultBranch: "main",
        mode: "DIRECT_COMMIT",
        github,
      }),
    ).rejects.toThrow(
      "Repository has publishing file conflicts. app-portal/http_server_start.py: app-portal/http_server_start.py already exists and will not be overwritten.",
    );
    expect(github.commitFiles).not.toHaveBeenCalled();
  });

  it("opens a PR when requested", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: vi.fn().mockResolvedValue(files),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn().mockResolvedValue({
        commitSha: "commit-sha",
        pullRequestUrl:
          "https://github.com/cedarville-it/campus-dashboard/pull/1",
      }),
    };

    await expect(
      prepareImportedRepository({
        appName: "Campus Dashboard",
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        mode: "PULL_REQUEST",
        github,
      }),
    ).resolves.toMatchObject({
      status: "PULL_REQUEST_OPENED",
      commitSha: "commit-sha",
      pullRequestUrl:
        "https://github.com/cedarville-it/campus-dashboard/pull/1",
    });
    expect(github.createPullRequestWithFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "portal/add-azure-publishing-campus-dashboard",
        expectedHeadSha: "head-sha",
      }),
    );
  });

  it("sanitizes repository names for PR branches", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: vi.fn().mockResolvedValue(files),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn().mockResolvedValue({
        commitSha: "commit-sha",
        pullRequestUrl:
          "https://github.com/cedarville-it/campus-dashboard/pull/1",
      }),
    };

    await prepareImportedRepository({
      appName: "Campus Dashboard",
      owner: "cedarville-it",
      name: "Campus Dashboard!",
      defaultBranch: "main",
      mode: "PULL_REQUEST",
      github,
    });

    expect(github.createPullRequestWithFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "portal/add-azure-publishing-campus-dashboard",
      }),
    );
  });

  it("blocks direct commits when compatibility conflicts exist", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        ...files,
        "app-portal/deployment-manifest.json": "{}",
      }),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn(),
    };

    await expect(
      prepareImportedRepository({
        appName: "Campus Dashboard",
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        mode: "DIRECT_COMMIT",
        github,
      }),
    ).rejects.toThrow(
      "Repository has publishing file conflicts. app-portal/deployment-manifest.json: app-portal/deployment-manifest.json already exists and will not be overwritten.",
    );
  });

  it("opens a PR when publishing-file conflicts need review", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        ...files,
        "app-portal/deployment-manifest.json": "{}",
      }),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn().mockResolvedValue({
        commitSha: "commit-sha",
        pullRequestUrl:
          "https://github.com/cedarville-it/campus-dashboard/pull/1",
      }),
    };

    await expect(
      prepareImportedRepository({
        appName: "Campus Dashboard",
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        mode: "PULL_REQUEST",
        github,
      }),
    ).resolves.toMatchObject({
      status: "PULL_REQUEST_OPENED",
      commitSha: "commit-sha",
      pullRequestUrl:
        "https://github.com/cedarville-it/campus-dashboard/pull/1",
    });
    expect(github.createPullRequestWithFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "portal/add-azure-publishing-campus-dashboard",
        body: expect.stringContaining(
          "Existing publishing files were detected",
        ),
        files: expect.objectContaining({
          "app-portal/deployment-manifest.json": expect.stringContaining(
            '"templateSlug": "imported-web-app"',
          ),
        }),
      }),
    );
    expect(github.commitFiles).not.toHaveBeenCalled();
  });

  it("includes compatibility findings for unsupported repositories", async () => {
    const github = {
      getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
      readRepositoryTextFiles: vi.fn().mockResolvedValue({
        "package.json": JSON.stringify({
          scripts: { start: "next start" },
          dependencies: { react: "19.0.0" },
        }),
      }),
      commitFiles: vi.fn(),
      createPullRequestWithFiles: vi.fn(),
    };

    await expect(
      prepareImportedRepository({
        appName: "Campus Dashboard",
        owner: "cedarville-it",
        name: "campus-dashboard",
        defaultBranch: "main",
        mode: "DIRECT_COMMIT",
        github,
      }),
    ).rejects.toThrow(
      "Repository is not compatible with v1 Azure publishing. Repository must be a root Next.js, FastAPI, or Python static app for portal-managed Azure publishing.",
    );
  });
});
