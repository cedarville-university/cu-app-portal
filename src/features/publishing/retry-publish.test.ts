// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { appAccessWhere } from "@/features/app-requests/access";
import { getPublishEligibility } from "./eligibility";
import type { QueuePublishDependencies } from "./queue-publish";
import { retryPublishForActor } from "./retry-publish";

const failedRequest = {
  id: "request-123",
  sourceOfTruth: "PORTAL_MANAGED_REPO" as const,
  repositoryStatus: "READY" as const,
  publishStatus: "FAILED" as const,
  publishingSetupStatus: "READY" as const,
  repositoryImport: null,
};

function createDependencies(): QueuePublishDependencies {
  const transactionClient = {
    appRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    publishAttempt: {
      create: vi.fn().mockResolvedValue({ id: "attempt-456" }),
    },
  };

  return {
    prisma: {
      appRequest: {
        findFirst: vi.fn().mockResolvedValue(failedRequest),
      },
      $transaction: vi.fn(async (callback) => callback(transactionClient)),
    },
    appAccessWhere: vi.fn(appAccessWhere),
    userHasAdminRole: vi.fn().mockResolvedValue(false),
    getPublishEligibility,
    recordAuditEvent: vi.fn().mockResolvedValue(undefined),
    runPublishAttempt: vi.fn().mockResolvedValue(undefined),
  } as unknown as QueuePublishDependencies;
}

describe("retryPublishForActor", () => {
  let dependencies: QueuePublishDependencies;

  beforeEach(() => {
    dependencies = createDependencies();
  });

  it("queues exactly one new attempt for an explicit failed-publish retry", async () => {
    await expect(
      retryPublishForActor(
        {
          requestId: "request-123",
          actorUserId: "collaborator-123",
          source: "codex-mcp",
        },
        dependencies,
      ),
    ).resolves.toEqual({ attemptId: "attempt-456", status: "QUEUED" });

    const transactionClient = await captureTransactionClient(dependencies);
    expect(transactionClient.publishAttempt.create).toHaveBeenCalledTimes(1);
    expect(dependencies.runPublishAttempt).toHaveBeenCalledWith("attempt-456");
  });

  it("rejects retry when the current publish is no longer failed", async () => {
    vi.mocked(dependencies.prisma.appRequest.findFirst).mockResolvedValue({
      ...failedRequest,
      publishStatus: "QUEUED",
    });

    await expect(
      retryPublishForActor(
        {
          requestId: "request-123",
          actorUserId: "owner-123",
          source: "portal-ui",
        },
        dependencies,
      ),
    ).rejects.toThrow("Only failed publish attempts can be retried.");

    expect(dependencies.prisma.$transaction).not.toHaveBeenCalled();
    expect(dependencies.runPublishAttempt).not.toHaveBeenCalled();
  });

  it.each(["NEEDS_REPAIR", "BLOCKED"] as const)(
    "preserves explicit retry while separate repair remains available in %s",
    async (publishingSetupStatus) => {
      vi.mocked(dependencies.prisma.appRequest.findFirst).mockResolvedValue({
        ...failedRequest,
        publishingSetupStatus,
      });

      await retryPublishForActor(
        {
          requestId: "request-123",
          actorUserId: "owner-123",
          source: "portal-ui",
        },
        dependencies,
      );

      const transactionClient = await captureTransactionClient(dependencies);
      expect(transactionClient.appRequest.updateMany).toHaveBeenCalledWith({
        where: {
          id: "request-123",
          repositoryStatus: "READY",
          publishingSetupStatus: {
            in: ["NOT_CHECKED", "READY", "NEEDS_REPAIR", "BLOCKED"],
          },
          publishStatus: { in: ["FAILED"] },
        },
        data: {
          publishStatus: "QUEUED",
          publishErrorSummary: null,
        },
      });
    },
  );

  it("requires imported repository preparation to remain committed", async () => {
    vi.mocked(dependencies.prisma.appRequest.findFirst).mockResolvedValue({
      ...failedRequest,
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryImport: { preparationStatus: "FAILED" },
    });

    await expect(
      retryPublishForActor(
        {
          requestId: "request-123",
          actorUserId: "owner-123",
          source: "codex-mcp",
        },
        dependencies,
      ),
    ).rejects.toThrow(
      "Imported app repository preparation must be committed before publishing.",
    );

    expect(dependencies.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("records retry audit attribution without implying setup repair", async () => {
    await retryPublishForActor(
      {
        requestId: "request-123",
        actorUserId: "admin-123",
        source: "codex-mcp",
      },
      dependencies,
    );

    expect(dependencies.recordAuditEvent).toHaveBeenCalledWith(
      "PUBLISH_REQUESTED",
      {
        requestId: "request-123",
        publishAttemptId: "attempt-456",
        actorUserId: "admin-123",
        source: "codex-mcp",
      },
    );
  });

  it("rejects an atomic stale-state claim without starting external work", async () => {
    const transactionClient = await captureTransactionClient(dependencies);
    vi.mocked(transactionClient.appRequest.updateMany).mockResolvedValue({
      count: 0,
    });

    await expect(
      retryPublishForActor(
        {
          requestId: "request-123",
          actorUserId: "owner-123",
          source: "portal-ui",
        },
        dependencies,
      ),
    ).rejects.toThrow("Publish request is already queued or running.");

    expect(transactionClient.publishAttempt.create).not.toHaveBeenCalled();
    expect(dependencies.runPublishAttempt).not.toHaveBeenCalled();
  });
});

async function captureTransactionClient(dependencies: QueuePublishDependencies) {
  const transaction = vi.mocked(dependencies.prisma.$transaction);
  const implementation = transaction.getMockImplementation();
  if (!implementation) {
    throw new Error("Transaction mock implementation is missing.");
  }

  let captured:
    | Parameters<Parameters<typeof dependencies.prisma.$transaction>[0]>[0]
    | undefined;
  await implementation(async (client) => {
    captured = client;
    return "captured";
  });
  if (!captured) {
    throw new Error("Transaction client was not captured.");
  }
  return captured;
}
