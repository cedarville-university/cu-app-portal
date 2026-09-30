// @vitest-environment node

import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RepositoryImportError,
  importRepositoryWithHistory,
} from "./import-repository";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();

  return {
    ...actual,
    mkdtemp: vi.fn(),
    readdir: vi.fn(),
    rm: vi.fn(),
    stat: vi.fn(),
    writeFile: vi.fn(),
  };
});

describe("importRepositoryWithHistory", () => {
  beforeEach(() => {
    vi.mocked(mkdtemp).mockReset();
    vi.mocked(readdir).mockReset();
    vi.mocked(readdir).mockRejectedValue(
      Object.assign(new Error("not materialized by fake exec"), { code: "ENOENT" }),
    );
    vi.mocked(rm).mockReset();
    vi.mocked(stat).mockReset();
    vi.mocked(writeFile).mockReset();
  });

  it("creates an empty target repository and mirrors public source history into it", async () => {
    const tempRoot = join(tmpdir(), "portal-import-test");
    const exec = vi.fn().mockResolvedValue(undefined);
    const onTargetReady = vi.fn().mockResolvedValue(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "trunk",
      }),
      updateRepositoryDefaultBranch: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "trunk",
      }),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    const repository = await importRepositoryWithHistory({
      appRequestId: "req-123",
      source: {
        owner: "external-org",
        name: "Campus-Dashboard",
        url: "https://github.com/external-org/Campus-Dashboard",
        defaultBranch: "trunk",
      },
      target: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        visibility: "private",
      },
      github,
      onTargetReady,
      exec,
    });

    expect(repository).toEqual({
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "trunk",
    });
    expect(github.createRepository).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      visibility: "private",
      files: {},
      defaultBranch: "trunk",
      autoInit: false,
      reuseIfAlreadyExists: true,
      ownershipMarker: {
        description: "CU Launch import request:req-123",
      },
    });
    expect(onTargetReady).toHaveBeenCalledWith(
      expect.objectContaining({ name: "campus-dashboard" }),
    );
    expect(onTargetReady.mock.invocationCallOrder[0]).toBeLessThan(
      exec.mock.invocationCallOrder[0],
    );
    expect(exec).toHaveBeenNthCalledWith(1, "git", [
      "clone",
      "--mirror",
      "https://github.com/external-org/Campus-Dashboard.git",
      join(tempRoot, "source.git"),
    ], {
      cwd: tempRoot,
      stdio: "ignore",
      signal: expect.any(AbortSignal),
    });
    expect(exec).toHaveBeenNthCalledWith(2, "git", [
      "-c",
      `credential.helper=store --file=${join(tempRoot, "target-credentials")}`,
      "push",
      "--mirror",
      "https://github.com/cedarville-it/campus-dashboard.git",
    ], {
      cwd: join(tempRoot, "source.git"),
      stdio: "ignore",
      signal: expect.any(AbortSignal),
    });
    expect(github.updateRepositoryDefaultBranch).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      defaultBranch: "trunk",
    });
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("uses a source installation token only for private source clone remotes", async () => {
    const tempRoot = join(tmpdir(), "portal-import-private-source");
    const exec = vi.fn().mockResolvedValue(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      updateRepositoryDefaultBranch: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
    };
    const sourceGithub = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("source-token"),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    await importRepositoryWithHistory({
      appRequestId: "req-123",
      source: {
        owner: "external-org",
        name: "Private-Dashboard",
        url: "https://github.com/external-org/Private-Dashboard",
        defaultBranch: "main",
      },
      target: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        visibility: "private",
      },
      sourceGithub,
      github,
      exec,
    });

    expect(exec).toHaveBeenNthCalledWith(1, "git", [
      "-c",
      `credential.helper=store --file=${join(tempRoot, "source-credentials")}`,
      "clone",
      "--mirror",
      "https://github.com/external-org/Private-Dashboard.git",
      join(tempRoot, "source.git"),
    ], {
      cwd: tempRoot,
      stdio: "ignore",
      signal: expect.any(AbortSignal),
    });
    expect(exec).toHaveBeenNthCalledWith(2, "git", [
      "-c",
      `credential.helper=store --file=${join(tempRoot, "target-credentials")}`,
      "push",
      "--mirror",
      "https://github.com/cedarville-it/campus-dashboard.git",
    ], {
      cwd: join(tempRoot, "source.git"),
      stdio: "ignore",
      signal: expect.any(AbortSignal),
    });
    expect(exec.mock.calls.flatMap(([, args]) => args).join(" ")).not.toContain(
      "source-token",
    );
    expect(exec.mock.calls.flatMap(([, args]) => args).join(" ")).not.toContain(
      "target-token",
    );
  });

  it("reports source clone failures with sanitized git details", async () => {
    const tempRoot = join(tmpdir(), "portal-import-failure");
    const exec = vi.fn().mockRejectedValue(
      Object.assign(
        new Error(
          "git failed for https://x-access-token:installation-token@github.com/external-org/Campus-Dashboard.git",
        ),
        {
          stderr:
            "fatal: repository 'https://x-access-token:installation-token@github.com/external-org/Campus-Dashboard.git/' not found\n",
        },
      ),
    );
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("installation-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      updateRepositoryDefaultBranch: vi.fn(),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    const failure = await importRepositoryWithHistory({
      appRequestId: "req-123",
      source: {
        owner: "external-org",
        name: "Campus-Dashboard",
        url: "https://github.com/external-org/Campus-Dashboard",
        defaultBranch: "trunk",
      },
      target: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        visibility: "private",
      },
      github,
      exec,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RepositoryImportError);
    expect(failure).toMatchObject({
      message:
        "Repository import failed while cloning source repository: fatal: repository 'https://github.com/external-org/Campus-Dashboard.git/' not found",
      stage: "clone",
      targetRepository: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      },
    });
    expect(String(failure.stack)).not.toContain("installation-token");
    expect(failure.message).not.toContain("installation-token");
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("reports target push failures with sanitized git details", async () => {
    const tempRoot = join(tmpdir(), "portal-import-push-failure");
    const exec = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        Object.assign(new Error("git push failed"), {
          stderr:
            "remote: Permission to cedarville-it/campus-dashboard.git denied to x-access-token.\nfatal: unable to access 'https://x-access-token:target-token@github.com/cedarville-it/campus-dashboard.git/': The requested URL returned error: 403\n",
        }),
      );
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      updateRepositoryDefaultBranch: vi.fn(),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    const failure = await importRepositoryWithHistory({
      appRequestId: "req-123",
      source: {
        owner: "external-org",
        name: "Campus-Dashboard",
        url: "https://github.com/external-org/Campus-Dashboard",
        defaultBranch: "trunk",
      },
      target: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        visibility: "private",
      },
      github,
      exec,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RepositoryImportError);
    expect(failure).toMatchObject({
      message:
        "Repository import failed while pushing history to target repository: remote: Permission to cedarville-it/campus-dashboard.git denied to x-access-token. fatal: unable to access 'https://github.com/cedarville-it/campus-dashboard.git/': The requested URL returned error: 403",
      stage: "push",
    });
    expect(failure.message).not.toContain("target-token");
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("falls back to the default branch when mirror push rejects hidden refs", async () => {
    const tempRoot = join(tmpdir(), "portal-import-hidden-ref-fallback");
    const exec = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        Object.assign(new Error("git push failed"), {
          stderr:
            "remote: error: GH013: Repository rule violations found for refs/pull/1/head.\nremote: deny updating a hidden ref\n",
        }),
      )
      .mockResolvedValueOnce(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      updateRepositoryDefaultBranch: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "trunk",
      }),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    const repository = await importRepositoryWithHistory({
      appRequestId: "req-123",
      source: {
        owner: "external-org",
        name: "Campus-Dashboard",
        url: "https://github.com/external-org/Campus-Dashboard",
        defaultBranch: "trunk",
      },
      target: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        visibility: "private",
      },
      github,
      exec,
    });

    expect(repository).toEqual({
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "trunk",
    });
    expect(exec).toHaveBeenNthCalledWith(3, "git", [
      "-c",
      `credential.helper=store --file=${join(tempRoot, "target-credentials")}`,
      "push",
      "https://github.com/cedarville-it/campus-dashboard.git",
      "refs/heads/trunk:refs/heads/trunk",
    ], {
      cwd: join(tempRoot, "source.git"),
      stdio: "ignore",
      signal: expect.any(AbortSignal),
    });
    expect(github.updateRepositoryDefaultBranch).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      defaultBranch: "trunk",
    });
  });

  it("preserves created target metadata when target token acquisition fails", async () => {
    const tempRoot = join(tmpdir(), "portal-import-target-token-failure");
    const exec = vi.fn().mockResolvedValue(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockRejectedValue(
        new Error("token service unavailable for target-token-secret"),
      ),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      updateRepositoryDefaultBranch: vi.fn(),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    const failure = await importRepositoryWithHistory({
      appRequestId: "req-123",
      source: {
        owner: "external-org",
        name: "Campus-Dashboard",
        url: "https://github.com/external-org/Campus-Dashboard",
        defaultBranch: "main",
      },
      target: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        visibility: "private",
      },
      github,
      exec,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RepositoryImportError);
    expect(failure).toMatchObject({
      message: "Repository import failed while preparing git authentication.",
      stage: "target-token",
      targetRepository: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      },
    });
    expect(String(failure.stack)).not.toContain("target-token-secret");
    expect(exec).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("preserves created target metadata when source token acquisition fails", async () => {
    const tempRoot = join(tmpdir(), "portal-import-source-token-failure");
    const exec = vi.fn().mockResolvedValue(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      updateRepositoryDefaultBranch: vi.fn(),
    };
    const sourceGithub = {
      createInstallationTokenForGit: vi.fn().mockRejectedValue(
        new Error("token service unavailable for source-token-secret"),
      ),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    const failure = await importRepositoryWithHistory({
      appRequestId: "req-123",
      source: {
        owner: "external-org",
        name: "Private-Dashboard",
        url: "https://github.com/external-org/Private-Dashboard",
        defaultBranch: "main",
      },
      target: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        visibility: "private",
      },
      sourceGithub,
      github,
      exec,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RepositoryImportError);
    expect(failure).toMatchObject({
      message: "Repository import failed while preparing git authentication.",
      stage: "source-token",
      targetRepository: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      },
    });
    expect(String(failure.stack)).not.toContain("source-token-secret");
    expect(exec).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalledWith(tempRoot, { recursive: true, force: true });
  });

  it("does not classify non-name GitHub 422 target creation failures as collisions", async () => {
    const tempRoot = join(tmpdir(), "portal-import-policy-failure");
    const policyError = Object.assign(
      new Error("GitHub API request failed: 422 Unprocessable Entity - visibility policy blocked"),
      {
        status: 422,
        errors: [
          {
            resource: "Repository",
            field: "visibility",
            code: "custom",
            message: "private repositories are disabled",
          },
        ],
      },
    );
    const github = {
      createInstallationTokenForGit: vi.fn(),
      createRepository: vi.fn().mockRejectedValue(policyError),
      updateRepositoryDefaultBranch: vi.fn(),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    await expect(
      importRepositoryWithHistory({
        appRequestId: "req-123",
        source: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "main",
        },
        target: {
          owner: "cedarville-it",
          name: "campus-dashboard",
          visibility: "private",
        },
        github,
        exec: vi.fn(),
      }),
    ).rejects.toMatchObject({
      name: "RepositoryImportError",
      message: "Repository import failed while creating the target repository.",
      stage: "create-target",
      code: undefined,
    });
  });

  it("marks default-branch update failures with the target metadata and stage", async () => {
    const tempRoot = join(tmpdir(), "portal-import-default-branch-failure");
    const exec = vi.fn().mockResolvedValue(undefined);
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      }),
      updateRepositoryDefaultBranch: vi.fn().mockRejectedValue(new Error("no ref")),
    };
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    await expect(
      importRepositoryWithHistory({
        appRequestId: "req-123",
        source: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "trunk",
        },
        target: {
          owner: "cedarville-it",
          name: "campus-dashboard",
          visibility: "private",
        },
        github,
        exec,
      }),
    ).rejects.toMatchObject({
      name: "RepositoryImportError",
      stage: "set-default-branch",
      targetRepository: {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "main",
      },
    });
  });

  it("recovers after a simulated death immediately after target creation", async () => {
    const tempRoot = join(tmpdir(), "portal-import-recovery");
    const repository = {
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
      description: "CU Launch import request:req-123",
    };
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue(repository),
      updateRepositoryDefaultBranch: vi.fn().mockResolvedValue(repository),
    };
    const exec = vi.fn().mockResolvedValue(undefined);
    vi.mocked(mkdtemp).mockResolvedValue(tempRoot);

    await expect(
      importRepositoryWithHistory({
        appRequestId: "req-123",
        source: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "main",
        },
        target: {
          owner: "cedarville-it",
          name: "campus-dashboard",
          visibility: "private",
        },
        github,
        onTargetReady: vi.fn().mockRejectedValue(new Error("simulated death")),
        exec,
      }),
    ).rejects.toThrow("simulated death");
    expect(exec).not.toHaveBeenCalled();

    await expect(
      importRepositoryWithHistory({
        appRequestId: "req-123",
        source: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "main",
        },
        target: {
          owner: "cedarville-it",
          name: "campus-dashboard",
          visibility: "private",
        },
        github,
        exec,
      }),
    ).resolves.toMatchObject({ name: "campus-dashboard" });
    expect(github.createRepository).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        reuseIfAlreadyExists: true,
        ownershipMarker: {
          description: "CU Launch import request:req-123",
        },
      }),
    );
  });

  it("turns an ownership-marker mismatch into a safe target collision", async () => {
    const github = {
      createInstallationTokenForGit: vi.fn(),
      createRepository: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "The existing managed repository does not belong to this app request.",
          ),
        ),
      updateRepositoryDefaultBranch: vi.fn(),
    };
    vi.mocked(mkdtemp).mockResolvedValue(join(tmpdir(), "portal-import-marker"));

    await expect(
      importRepositoryWithHistory({
        appRequestId: "req-123",
        source: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "main",
        },
        target: {
          owner: "cedarville-it",
          name: "campus-dashboard",
          visibility: "private",
        },
        github,
        exec: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: "TARGET_REPOSITORY_ALREADY_EXISTS",
      stage: "create-target",
    });
  });

  it("aborts Git when the mirror exceeds its time limit", async () => {
    const repository = {
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
    };
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue(repository),
      updateRepositoryDefaultBranch: vi.fn(),
    };
    const exec = vi.fn(
      async (_command: string, _args: string[], options: { signal?: AbortSignal }) =>
        new Promise<void>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    );
    vi.mocked(mkdtemp).mockResolvedValue(join(tmpdir(), "portal-import-timeout"));

    await expect(
      importRepositoryWithHistory({
        appRequestId: "req-123",
        source: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "main",
        },
        target: {
          owner: "cedarville-it",
          name: "campus-dashboard",
          visibility: "private",
        },
        github,
        exec,
        limits: { timeoutMs: 5, maxBytes: 1024 * 1024 },
      }),
    ).rejects.toMatchObject({
      stage: "clone",
      message: expect.stringMatching(/time limit/i),
    });
    expect(exec.mock.calls[0]?.[2].signal).toBeInstanceOf(AbortSignal);
  });

  it("stops before push when the mirror exceeds its byte limit", async () => {
    const repository = {
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
    };
    const github = {
      createInstallationTokenForGit: vi.fn().mockResolvedValue("target-token"),
      createRepository: vi.fn().mockResolvedValue(repository),
      updateRepositoryDefaultBranch: vi.fn(),
    };
    const exec = vi.fn().mockResolvedValue(undefined);
    vi.mocked(mkdtemp).mockResolvedValue(join(tmpdir(), "portal-import-size"));
    vi.mocked(readdir).mockResolvedValue([
      { name: "packfile", isDirectory: () => false },
    ] as never);
    vi.mocked(stat).mockResolvedValue({ size: 2048 } as never);

    await expect(
      importRepositoryWithHistory({
        appRequestId: "req-123",
        source: {
          owner: "external-org",
          name: "Campus-Dashboard",
          url: "https://github.com/external-org/Campus-Dashboard",
          defaultBranch: "main",
        },
        target: {
          owner: "cedarville-it",
          name: "campus-dashboard",
          visibility: "private",
        },
        github,
        exec,
        limits: { timeoutMs: 60_000, maxBytes: 1024 },
      }),
    ).rejects.toMatchObject({
      stage: "clone",
      message: expect.stringMatching(/size limit/i),
    });
    expect(exec).toHaveBeenCalledOnce();
  });
});
