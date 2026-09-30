// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimImportAttempt,
  completeImportAttempt,
  createImportAttempt,
  failImportAttempt,
  renewImportAttemptLease,
} from "./attempts";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  attemptFindUnique: vi.fn(),
  attemptUpdateMany: vi.fn(),
  importUpdateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: db.transaction,
    repositoryImportAttempt: {
      findUnique: db.attemptFindUnique,
      updateMany: db.attemptUpdateMany,
    },
    repositoryImport: {
      updateMany: db.importUpdateMany,
    },
  },
}));

const now = new Date("2026-09-30T16:00:00.000Z");
const leaseExpiresAt = new Date("2026-09-30T16:35:00.000Z");

const claimedAttempt = {
  id: "attempt-123",
  repositoryImportId: "import-123",
  workerExecutionName: "job-abc",
  leaseExpiresAt,
  repositoryImport: { appRequestId: "request-123" },
};

describe("repository import attempt transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.transaction.mockImplementation(async (callback) =>
      callback({
        repositoryImportAttempt: {
          updateMany: db.attemptUpdateMany,
        },
        repositoryImport: {
          updateMany: db.importUpdateMany,
        },
      }),
    );
    db.attemptFindUnique.mockResolvedValue(claimedAttempt);
    db.importUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("creates an append-only pending attempt and makes it active", async () => {
    const tx = {
      repositoryImportAttempt: {
        create: vi.fn().mockResolvedValue({ id: "attempt-123" }),
      },
      repositoryImport: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await expect(
      createImportAttempt(tx as never, {
        repositoryImportId: "import-123",
        now,
      }),
    ).resolves.toEqual({ attemptId: "attempt-123" });

    expect(tx.repositoryImportAttempt.create).toHaveBeenCalledWith({
      data: {
        repositoryImportId: "import-123",
        status: "PENDING",
        stage: "ENQUEUE",
        queuedAt: now,
      },
      select: { id: true },
    });
    expect(tx.repositoryImport.updateMany).toHaveBeenCalledWith({
      where: { id: "import-123", activeAttemptId: null },
      data: { activeAttemptId: "attempt-123" },
    });
  });

  it("allows only one claimant for a non-expired lease", async () => {
    db.attemptUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      claimImportAttempt({
        attemptId: "attempt-123",
        workerExecutionName: "job-abc",
        deliveryCount: 2,
        now,
      }),
    ).resolves.toEqual({
      attemptId: "attempt-123",
      repositoryImportId: "import-123",
      appRequestId: "request-123",
      workerExecutionName: "job-abc",
      leaseExpiresAt,
    });

    await expect(
      claimImportAttempt({
        attemptId: "attempt-123",
        workerExecutionName: "job-other",
        deliveryCount: 3,
        now,
      }),
    ).resolves.toBeNull();

    expect(db.attemptUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "attempt-123",
        repositoryImport: { activeAttemptId: "attempt-123" },
        OR: [
          { status: "PENDING" },
          { status: "RUNNING", leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: "RUNNING",
        stage: "CLAIM",
        workerExecutionName: "job-abc",
        leaseExpiresAt,
        lastHeartbeatAt: now,
        lastDeliveryCount: 2,
        startedAt: now,
        errorSummary: null,
      },
    });
  });

  it("reclaims a running attempt only after its lease expires", async () => {
    db.attemptUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    db.attemptFindUnique.mockResolvedValue({
      ...claimedAttempt,
      workerExecutionName: "job-next",
    });

    await expect(
      claimImportAttempt({
        attemptId: "attempt-123",
        workerExecutionName: "job-next",
        deliveryCount: 4,
        now: new Date("2026-09-30T15:59:59.999Z"),
      }),
    ).resolves.toBeNull();

    await expect(
      claimImportAttempt({
        attemptId: "attempt-123",
        workerExecutionName: "job-next",
        deliveryCount: 5,
        now,
      }),
    ).resolves.toMatchObject({ workerExecutionName: "job-next" });

    expect(db.attemptUpdateMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        OR: [
          { status: "PENDING" },
          { status: "RUNNING", leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        lastHeartbeatAt: now,
        lastDeliveryCount: 5,
      },
    });
  });

  it("refuses completion when the caller no longer owns the lease", async () => {
    db.attemptUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      completeImportAttempt(
        {
          attemptId: "attempt-123",
          repositoryImportId: "import-123",
          appRequestId: "request-123",
          workerExecutionName: "job-stale",
          leaseExpiresAt,
        },
        { now },
      ),
    ).resolves.toBe(false);

    expect(db.importUpdateMany).not.toHaveBeenCalled();
  });

  it("clears activeAttemptId only for the matching terminal attempt", async () => {
    db.attemptUpdateMany.mockResolvedValue({ count: 1 });

    const lease = {
      attemptId: "attempt-123",
      repositoryImportId: "import-123",
      appRequestId: "request-123",
      workerExecutionName: "job-abc",
      leaseExpiresAt,
    };

    await expect(completeImportAttempt(lease, { now })).resolves.toBe(true);
    expect(db.importUpdateMany).toHaveBeenCalledWith({
      where: { id: "import-123", activeAttemptId: "attempt-123" },
      data: { activeAttemptId: null },
    });

    db.attemptUpdateMany.mockResolvedValue({ count: 1 });
    await expect(
      failImportAttempt(lease, {
        stage: "CLONE" as never,
        errorSummary: "Clone timed out.",
        now,
      }),
    ).resolves.toBe(true);
    expect(db.attemptUpdateMany).toHaveBeenLastCalledWith({
      where: {
        id: "attempt-123",
        status: "RUNNING",
        workerExecutionName: "job-abc",
        leaseExpiresAt: { gt: now },
      },
      data: {
        status: "FAILED",
        stage: "CLONE",
        errorSummary: "Clone timed out.",
        finishedAt: now,
        leaseExpiresAt: null,
      },
    });
  });

  it("renews heartbeat and the 35-minute lease only for its owner", async () => {
    db.attemptUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      renewImportAttemptLease(
        {
          attemptId: "attempt-123",
          repositoryImportId: "import-123",
          appRequestId: "request-123",
          workerExecutionName: "job-abc",
          leaseExpiresAt: now,
        },
        now,
      ),
    ).resolves.toEqual({
      attemptId: "attempt-123",
      repositoryImportId: "import-123",
      appRequestId: "request-123",
      workerExecutionName: "job-abc",
      leaseExpiresAt,
    });

    expect(db.attemptUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "attempt-123",
        status: "RUNNING",
        workerExecutionName: "job-abc",
        leaseExpiresAt: { gt: now },
      },
      data: { leaseExpiresAt, lastHeartbeatAt: now },
    });
  });
});
