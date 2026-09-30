// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoryImportError } from "./import-repository";
import {
  runRepositoryImportAttempt,
  type RepositoryImportRunnerDeps,
} from "./run-import-attempt";

const now = new Date("2026-09-30T18:00:00.000Z");
const lease = {
  attemptId: "attempt-123",
  repositoryImportId: "import-123",
  appRequestId: "request-123",
  workerExecutionName: "job-execution-7",
  leaseExpiresAt: new Date("2026-09-30T18:35:00.000Z"),
};

function createDependencies(): RepositoryImportRunnerDeps & {
  tx: Record<string, any>;
  targetGithub: Record<string, any>;
} {
  const tx = {
    repositoryImportAttempt: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    repositoryImport: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    appRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const context = {
    id: "attempt-123",
    status: "RUNNING",
    stage: "CLAIM",
    repositoryImport: {
      id: "import-123",
      activeAttemptId: "attempt-123",
      sourceRepositoryOwner: "external-org",
      sourceRepositoryName: "Campus-Dashboard",
      sourceRepositoryUrl: "https://github.com/external-org/Campus-Dashboard",
      sourceRepositoryDefaultBranch: "trunk",
      targetRepositoryOwner: "cedarville-it",
      targetRepositoryName: "campus-dashboard",
      appRequest: {
        id: "request-123",
        userId: "owner-123",
        supportReference: "SUP-123",
      },
    },
  };
  const db = {
    repositoryImportAttempt: {
      findUnique: vi.fn().mockResolvedValue(context),
      updateMany: tx.repositoryImportAttempt.updateMany,
    },
    repositoryImport: tx.repositoryImport,
    appRequest: tx.appRequest,
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const targetGithub = {
    createInstallationTokenForGit: vi.fn(),
    createRepository: vi.fn(),
    updateRepositoryDefaultBranch: vi.fn(),
  };
  const targetRepository = {
    owner: "cedarville-it",
    name: "campus-dashboard",
    url: "https://github.com/cedarville-it/campus-dashboard",
    defaultBranch: "trunk",
  };
  const importRepository = vi.fn(async (input: any) => {
    await input.onTargetReady(targetRepository);
    return targetRepository;
  });

  return {
    tx,
    targetGithub,
    db: db as never,
    claimImportAttempt: vi.fn().mockResolvedValue(lease),
    importRepository,
    createGitHubClients: vi.fn().mockReturnValue({
      targetGithub,
      sourceGithub: undefined,
    }),
    recordAuditEvent: vi.fn().mockResolvedValue(undefined),
    notifyAppEvent: vi.fn().mockResolvedValue(undefined),
    now: () => now,
    log: vi.fn(),
    applicationCommit: "abcdef123456",
    imageDigest: "sha256:image123",
  };
}

describe("runRepositoryImportAttempt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does no provider work when another worker owns a live lease", async () => {
    const deps = createDependencies();
    vi.mocked(deps.claimImportAttempt).mockResolvedValue(null);

    await expect(
      runRepositoryImportAttempt(
        {
          attemptId: "attempt-123",
          workerExecutionName: "job-duplicate",
          deliveryCount: 2,
        },
        deps,
      ),
    ).resolves.toEqual({ disposition: "complete", result: "already-terminal" });
    expect(deps.createGitHubClients).not.toHaveBeenCalled();
    expect(deps.importRepository).not.toHaveBeenCalled();
  });

  it("recovers an expired lease against the same marked target", async () => {
    const deps = createDependencies();

    await runRepositoryImportAttempt(
      {
        attemptId: "attempt-123",
        workerExecutionName: "job-execution-7",
        deliveryCount: 3,
      },
      deps,
    );

    expect(deps.importRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        appRequestId: "request-123",
        target: expect.objectContaining({
          owner: "cedarville-it",
          name: "campus-dashboard",
        }),
      }),
    );
  });

  it("persists target metadata before clone continues", async () => {
    const deps = createDependencies();
    vi.mocked(deps.importRepository).mockImplementation(async (input: any) => {
      await input.onTargetReady({
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "trunk",
      });
      expect(deps.tx.repositoryImport.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetRepositoryUrl:
              "https://github.com/cedarville-it/campus-dashboard",
          }),
        }),
      );
      return {
        owner: "cedarville-it",
        name: "campus-dashboard",
        url: "https://github.com/cedarville-it/campus-dashboard",
        defaultBranch: "trunk",
      };
    });

    await runRepositoryImportAttempt(
      {
        attemptId: "attempt-123",
        workerExecutionName: "job-execution-7",
        deliveryCount: 1,
      },
      deps,
    );
  });

  it("atomically completes all aggregate state before audit and notification", async () => {
    const deps = createDependencies();

    await expect(
      runRepositoryImportAttempt(
        {
          attemptId: "attempt-123",
          workerExecutionName: "job-execution-7",
          deliveryCount: 1,
        },
        deps,
      ),
    ).resolves.toEqual({ disposition: "complete", result: "succeeded" });

    expect(deps.tx.repositoryImportAttempt.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "attempt-123",
        status: "RUNNING",
        workerExecutionName: "job-execution-7",
      }),
      data: expect.objectContaining({
        status: "SUCCEEDED",
        stage: "COMPLETE",
        finishedAt: now,
      }),
    });
    expect(deps.tx.repositoryImport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activeAttemptId: null,
          importStatus: "SUCCEEDED",
          preparationStatus: "PENDING_USER_CHOICE",
        }),
      }),
    );
    expect(deps.tx.appRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ repositoryStatus: "READY" }),
      }),
    );
    expect(
      vi.mocked(deps.recordAuditEvent).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(deps.notifyAppEvent).mock.invocationCallOrder[0]);
  });

  it.each([408, 429, 500, 503])(
    "abandons transient HTTP %s without a failure notification",
    async (status) => {
      const deps = createDependencies();
      vi.mocked(deps.importRepository).mockRejectedValue(
        Object.assign(new Error("provider detail token=secret"), { status }),
      );

      await expect(
        runRepositoryImportAttempt(
          {
            attemptId: "attempt-123",
            workerExecutionName: "job-execution-7",
            deliveryCount: 2,
          },
          deps,
        ),
      ).resolves.toMatchObject({ disposition: "abandon" });
      expect(deps.tx.repositoryImportAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PENDING",
            workerExecutionName: null,
            leaseExpiresAt: null,
          }),
        }),
      );
      expect(deps.notifyAppEvent).not.toHaveBeenCalled();
    },
  );

  it("abandons network failures", async () => {
    const deps = createDependencies();
    vi.mocked(deps.importRepository).mockRejectedValue(
      Object.assign(new Error("socket failed token=secret"), {
        code: "ECONNRESET",
      }),
    );

    await expect(
      runRepositoryImportAttempt(
        {
          attemptId: "attempt-123",
          workerExecutionName: "job-execution-7",
          deliveryCount: 2,
        },
        deps,
      ),
    ).resolves.toMatchObject({ disposition: "abandon" });
    expect(deps.notifyAppEvent).not.toHaveBeenCalled();
  });

  it.each([
    Object.assign(new Error("forbidden token=secret"), { status: 403 }),
    Object.assign(new Error("validation token=secret"), { status: 422 }),
    new RepositoryImportError({
      message: "Repository import exceeded its size limit.",
      stage: "clone",
    }),
    new RepositoryImportError({
      message: "Repository import exceeded its time limit.",
      stage: "clone",
    }),
  ])("dead-letters terminal failures with sanitized text", async (error) => {
    const deps = createDependencies();
    vi.mocked(deps.importRepository).mockRejectedValue(error);

    const result = await runRepositoryImportAttempt(
      {
        attemptId: "attempt-123",
        workerExecutionName: "job-execution-7",
        deliveryCount: 1,
      },
      deps,
    );

    expect(result.disposition).toBe("dead-letter");
    expect(result).not.toEqual(expect.objectContaining({ errorSummary: expect.stringContaining("secret") }));
    expect(deps.notifyAppEvent).toHaveBeenCalledOnce();
  });

  it("finalizes a terminal failure and notifies only once", async () => {
    const deps = createDependencies();
    vi.mocked(deps.importRepository).mockRejectedValue(
      Object.assign(new Error("permission denied token=secret"), { status: 403 }),
    );
    vi.mocked(deps.tx.repositoryImportAttempt.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await runRepositoryImportAttempt(
      {
        attemptId: "attempt-123",
        workerExecutionName: "job-execution-7",
        deliveryCount: 1,
      },
      deps,
    );
    await runRepositoryImportAttempt(
      {
        attemptId: "attempt-123",
        workerExecutionName: "job-execution-7",
        deliveryCount: 2,
      },
      deps,
    );

    expect(deps.notifyAppEvent).toHaveBeenCalledOnce();
    expect(deps.recordAuditEvent).toHaveBeenCalledOnce();
  });

  it("logs safe error status and code diagnostics without the raw message", async () => {
    const deps = createDependencies();
    vi.mocked(deps.importRepository).mockRejectedValue(
      Object.assign(new Error("forbidden token=secret"), {
        status: 403,
        code: "GITHUB_DENIED",
      }),
    );

    await runRepositoryImportAttempt(
      {
        attemptId: "attempt-123",
        workerExecutionName: "job-execution-7",
        deliveryCount: 1,
      },
      deps,
    );

    expect(deps.log).toHaveBeenCalledWith(
      "failed",
      expect.objectContaining({
        errorDiagnostics: [
          { name: "Error", status: 403, code: "GITHUB_DENIED" },
        ],
      }),
    );
    expect(JSON.stringify(vi.mocked(deps.log).mock.calls)).not.toContain(
      "forbidden token=secret",
    );
  });

  it("logs identifiers and build metadata without raw errors or configuration", async () => {
    const deps = createDependencies();

    await runRepositoryImportAttempt(
      {
        attemptId: "attempt-123",
        workerExecutionName: "job-execution-7",
        deliveryCount: 1,
      },
      deps,
    );

    expect(deps.log).toHaveBeenCalledWith(
      "succeeded",
      expect.objectContaining({
        supportReference: "SUP-123",
        requestId: "request-123",
        repositoryImportId: "import-123",
        attemptId: "attempt-123",
        workerExecutionName: "job-execution-7",
        stage: "COMPLETE",
        applicationCommit: "abcdef123456",
        imageDigest: "sha256:image123",
      }),
    );
    expect(JSON.stringify(vi.mocked(deps.log).mock.calls)).not.toMatch(
      /token|credential|privateKey|environment/i,
    );
  });
});
