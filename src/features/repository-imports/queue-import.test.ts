// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAuditEvent } from "@/lib/audit";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { createImportAttempt } from "./attempts";
import { queueExternalRepositoryImport } from "./queue-import";

vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/features/notifications/safe-notify", () => ({
  safeNotifyAppEvent: vi.fn(),
}));
vi.mock("./attempts", () => ({ createImportAttempt: vi.fn() }));

const now = new Date("2026-09-30T17:00:00.000Z");
const input = {
  userId: "user-123",
  appName: "Campus Dashboard",
  description: "Existing dashboard.",
  source: {
    owner: "external-org",
    name: "Campus-Dashboard",
    url: "https://github.com/external-org/Campus-Dashboard",
    defaultBranch: "trunk",
  },
  targetOwner: "cedarville-it",
  targetName: "campus-dashboard",
  targetVisibility: "private" as const,
  supportReference: "SUP-123",
};

function createDependencies() {
  const timeline: string[] = [];
  const tx = {
    template: {
      upsert: vi.fn(async () => {
        timeline.push("template");
        return { id: "template-imported" };
      }),
    },
    appRequest: {
      create: vi.fn(async () => {
        timeline.push("request");
        return { id: "request-123" };
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    repositoryImport: {
      create: vi.fn(async () => {
        timeline.push("import");
        return { id: "import-123" };
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    repositoryImportAttempt: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const db = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => {
      const result = await callback(tx);
      timeline.push("commit");
      return result;
    }),
  };
  const queue = {
    send: vi.fn(async () => {
      timeline.push("send");
    }),
  };

  return { timeline, tx, db, queue };
}

describe("queueExternalRepositoryImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createImportAttempt).mockImplementation(async () => {
      return { attemptId: "attempt-123" };
    });
  });

  it("commits the request, import, and active attempt before sending", async () => {
    const { timeline, tx, db, queue } = createDependencies();
    vi.mocked(createImportAttempt).mockImplementation(async () => {
      timeline.push("attempt");
      return { attemptId: "attempt-123" };
    });

    await expect(
      queueExternalRepositoryImport(input, {
        db: db as never,
        queue,
        now: () => now,
      }),
    ).resolves.toEqual({
      requestId: "request-123",
      attemptId: "attempt-123",
      queued: true,
    });

    expect(timeline).toEqual([
      "template",
      "request",
      "import",
      "attempt",
      "commit",
      "send",
    ]);
    expect(tx.appRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        repositoryStatus: "PENDING",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        repositoryUrl: null,
      }),
    });
    expect(tx.repositoryImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        importStatus: "PENDING",
        preparationStatus: "NOT_STARTED",
      }),
      select: { id: true },
    });
    expect(queue.send).toHaveBeenCalledWith({ attemptId: "attempt-123" });
  });

  it("returns pending after queue acceptance without running Git work", async () => {
    const { db, queue } = createDependencies();

    await expect(
      queueExternalRepositoryImport(input, {
        db: db as never,
        queue,
        now: () => now,
      }),
    ).resolves.toMatchObject({ queued: true });

    expect(queue.send).toHaveBeenCalledOnce();
  });

  it("durably fails the exact attempt at ENQUEUE when sending fails", async () => {
    const { tx, db, queue } = createDependencies();
    queue.send.mockRejectedValueOnce(new Error("Service Bus unavailable"));

    await expect(
      queueExternalRepositoryImport(input, {
        db: db as never,
        queue,
        now: () => now,
      }),
    ).resolves.toEqual({
      requestId: "request-123",
      attemptId: "attempt-123",
      queued: false,
    });

    expect(tx.repositoryImportAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        id: "attempt-123",
        status: "PENDING",
        repositoryImport: { activeAttemptId: "attempt-123" },
      },
      data: {
        status: "FAILED",
        stage: "ENQUEUE",
        errorSummary: "Repository import could not be queued. Please retry.",
        finishedAt: now,
      },
    });
    expect(tx.repositoryImport.updateMany).toHaveBeenCalledWith({
      where: { id: "import-123", activeAttemptId: "attempt-123" },
      data: {
        activeAttemptId: null,
        importStatus: "FAILED",
        importErrorSummary: "Repository import could not be queued. Please retry.",
        preparationStatus: "BLOCKED",
        preparationErrorSummary:
          "Repository import could not be queued. Please retry.",
      },
    });
    expect(tx.appRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "request-123", repositoryStatus: "PENDING" },
      data: {
        repositoryStatus: "FAILED",
        publishErrorSummary: "Repository import could not be queued. Please retry.",
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "EXISTING_APP_IMPORT_FAILED",
      expect.objectContaining({ requestId: "request-123" }),
    );
    expect(safeNotifyAppEvent).toHaveBeenCalledWith({
      appRequestId: "request-123",
      eventKey: "REPOSITORY_FAILED",
      actorUserId: "user-123",
      directRecipientUserIds: ["user-123"],
    });
  });

  it("marks an ambiguously sent failed attempt terminal so it cannot be claimed", async () => {
    const { tx, db, queue } = createDependencies();
    queue.send.mockImplementationOnce(async () => {
      throw new Error("response lost after broker accepted message");
    });

    await queueExternalRepositoryImport(input, {
      db: db as never,
      queue,
      now: () => now,
    });

    expect(tx.repositoryImportAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(tx.repositoryImport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ activeAttemptId: null }),
      }),
    );
  });
});
