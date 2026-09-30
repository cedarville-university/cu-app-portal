// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { reconcileDeadLetteredAttempt } from "./reconcile-dead-letter";

function createDeps(status: "PENDING" | "RUNNING" | "SUCCEEDED" = "RUNNING") {
  const attempt = {
    id: "attempt-1",
    status,
    stage: "PUSH",
    repositoryImportId: "import-1",
    repositoryImport: {
      activeAttemptId: "attempt-1",
      appRequestId: "request-1",
      appRequest: { userId: "user-1", supportReference: "SUP-123" },
    },
  };
  const tx = {
    repositoryImportAttempt: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    repositoryImport: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    appRequest: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    deps: {
      db: {
        repositoryImportAttempt: {
          findUnique: vi.fn().mockResolvedValue(attempt),
        },
        $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
          callback(tx),
        ),
      },
      now: () => new Date("2026-09-30T18:00:00.000Z"),
      recordAuditEvent: vi.fn().mockResolvedValue(undefined),
      notifyAppEvent: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
    },
    tx,
  };
}

describe("dead-letter reconciliation", () => {
  it("terminally reconciles one active attempt and emits sanitized identifiers", async () => {
    const setup = createDeps();
    await expect(
      reconcileDeadLetteredAttempt("attempt-1", setup.deps as never),
    ).resolves.toBe("reconciled");
    expect(setup.tx.repositoryImportAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        id: "attempt-1",
        status: { in: ["PENDING", "RUNNING"] },
        repositoryImport: { activeAttemptId: "attempt-1" },
      },
      data: expect.objectContaining({
        status: "FAILED",
        errorSummary: expect.not.stringContaining("token"),
      }),
    });
    expect(setup.deps.log).toHaveBeenCalledWith("reconciled", {
      attemptId: "attempt-1",
      repositoryImportId: "import-1",
      requestId: "request-1",
      supportReference: "SUP-123",
      reason: "Repository import reached the dead-letter queue.",
    });
  });

  it("is a no-op for a missing attempt", async () => {
    const setup = createDeps();
    setup.deps.db.repositoryImportAttempt.findUnique.mockResolvedValue(null);
    await expect(
      reconcileDeadLetteredAttempt("missing", setup.deps as never),
    ).resolves.toBe("missing");
    expect(setup.deps.db.$transaction).not.toHaveBeenCalled();
  });

  it("is a no-op for a terminal attempt", async () => {
    const setup = createDeps("SUCCEEDED");
    await expect(
      reconcileDeadLetteredAttempt("attempt-1", setup.deps as never),
    ).resolves.toBe("already-terminal");
    expect(setup.deps.db.$transaction).not.toHaveBeenCalled();
  });

  it("reconciles an active attempt only once", async () => {
    const setup = createDeps();
    setup.tx.repositoryImportAttempt.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(
      reconcileDeadLetteredAttempt("attempt-1", setup.deps as never),
    ).resolves.toBe("reconciled");
    await expect(
      reconcileDeadLetteredAttempt("attempt-1", setup.deps as never),
    ).resolves.toBe("already-terminal");
    expect(setup.deps.notifyAppEvent).toHaveBeenCalledTimes(1);
  });
});
