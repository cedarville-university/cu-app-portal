// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { appAccessWhere } from "@/features/app-requests/access";
import { recordAuditEvent } from "@/lib/audit";
import { getPublishEligibility } from "./eligibility";
import { runPublishAttempt } from "./run-publish-attempt";
import {
  queuePublishForActor,
  type QueuePublishDependencies,
} from "./queue-publish";

const generatedRequest = {
  id: "request-123",
  sourceOfTruth: "PORTAL_MANAGED_REPO" as const,
  repositoryStatus: "READY" as const,
  publishStatus: "NOT_STARTED" as const,
  publishingSetupStatus: "READY" as const,
  repositoryImport: null,
};

function createDependencies(): QueuePublishDependencies {
  const transactionClient = {
    appRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    publishAttempt: {
      create: vi.fn().mockResolvedValue({ id: "attempt-123" }),
    },
  };

  return {
    prisma: {
      appRequest: {
        findFirst: vi.fn().mockResolvedValue(generatedRequest),
      },
      $transaction: vi.fn(async (callback) => callback(transactionClient)),
    },
    appAccessWhere: vi.fn(appAccessWhere),
    userHasAdminRole: vi.fn().mockResolvedValue(false),
    getPublishEligibility,
    recordAuditEvent: vi.fn(recordAuditEvent).mockResolvedValue(undefined),
    runPublishAttempt: vi.fn(runPublishAttempt).mockResolvedValue(undefined),
  } as unknown as QueuePublishDependencies;
}

describe("queuePublishForActor", () => {
  let dependencies: QueuePublishDependencies;

  beforeEach(() => {
    dependencies = createDependencies();
  });

  it.each([
    ["owner-123", false],
    ["collaborator-123", false],
    ["admin-123", true],
  ])("queues for an authorized %s actor", async (actorUserId, isAdmin) => {
    vi.mocked(dependencies.userHasAdminRole).mockResolvedValue(isAdmin);

    await expect(
      queuePublishForActor(
        {
          requestId: "request-123",
          actorUserId,
          source: "codex-mcp",
        },
        dependencies,
      ),
    ).resolves.toEqual({ attemptId: "attempt-123", status: "QUEUED" });

    expect(dependencies.appAccessWhere).toHaveBeenLastCalledWith(
      "request-123",
      actorUserId,
      isAdmin,
    );
  });

  it("uses the same quiet not-found result for a foreign or missing app", async () => {
    vi.mocked(dependencies.prisma.appRequest.findFirst).mockResolvedValue(null);

    const missing = await queuePublishForActor(
      {
        requestId: "missing",
        actorUserId: "actor-123",
        source: "codex-mcp",
      },
      dependencies,
    ).catch((error: unknown) => error);
    const foreign = await queuePublishForActor(
      {
        requestId: "foreign",
        actorUserId: "actor-123",
        source: "codex-mcp",
      },
      dependencies,
    ).catch((error: unknown) => error);

    expect(missing).toEqual(foreign);
    expect(missing).toEqual(new Error("App request not found."));
    expect(dependencies.prisma.$transaction).not.toHaveBeenCalled();
    expect(dependencies.runPublishAttempt).not.toHaveBeenCalled();
  });

  it("allows generated apps to publish before setup has been checked", async () => {
    vi.mocked(dependencies.prisma.appRequest.findFirst).mockResolvedValue({
      ...generatedRequest,
      publishingSetupStatus: "NOT_CHECKED",
    });

    await queuePublishForActor(
      {
        requestId: "request-123",
        actorUserId: "owner-123",
        source: "portal-ui",
      },
      dependencies,
    );

    const transactionClient = await firstTransactionClient(dependencies);
    expect(transactionClient.appRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-123",
        repositoryStatus: "READY",
        publishingSetupStatus: { in: ["NOT_CHECKED", "READY"] },
        publishStatus: { in: ["NOT_STARTED", "SUCCEEDED"] },
      },
      data: {
        publishStatus: "QUEUED",
        publishErrorSummary: null,
      },
    });
  });

  it("allows an explicit republish after success", async () => {
    vi.mocked(dependencies.prisma.appRequest.findFirst).mockResolvedValue({
      ...generatedRequest,
      publishStatus: "SUCCEEDED",
    });

    await expect(
      queuePublishForActor(
        {
          requestId: "request-123",
          actorUserId: "owner-123",
          source: "portal-ui",
        },
        dependencies,
      ),
    ).resolves.toEqual({ attemptId: "attempt-123", status: "QUEUED" });
  });

  it("preserves imported-app readiness in the atomic queue predicate", async () => {
    vi.mocked(dependencies.prisma.appRequest.findFirst).mockResolvedValue({
      ...generatedRequest,
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryImport: { preparationStatus: "COMMITTED" },
    });

    await queuePublishForActor(
      {
        requestId: "request-123",
        actorUserId: "collaborator-123",
        source: "portal-ui",
      },
      dependencies,
    );

    const transactionClient = await firstTransactionClient(dependencies);
    expect(transactionClient.appRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-123",
        repositoryStatus: "READY",
        publishingSetupStatus: "READY",
        publishStatus: { in: ["NOT_STARTED", "SUCCEEDED"] },
      },
      data: {
        publishStatus: "QUEUED",
        publishErrorSummary: null,
      },
    });
  });

  it("rejects a stale state atomically without creating or starting an attempt", async () => {
    const transactionClient = await firstTransactionClient(dependencies);
    vi.mocked(transactionClient.appRequest.updateMany).mockResolvedValue({
      count: 0,
    });

    await expect(
      queuePublishForActor(
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

  it("records the explicit actor and caller source on the publish audit", async () => {
    await queuePublishForActor(
      {
        requestId: "request-123",
        actorUserId: "collaborator-123",
        source: "codex-mcp",
      },
      dependencies,
    );

    expect(dependencies.recordAuditEvent).toHaveBeenCalledWith(
      "PUBLISH_REQUESTED",
      {
        requestId: "request-123",
        publishAttemptId: "attempt-123",
        actorUserId: "collaborator-123",
        source: "codex-mcp",
      },
    );
  });

  it("starts the background worker only after the transaction commits", async () => {
    const order: string[] = [];
    const transactionClient = await firstTransactionClient(dependencies);
    vi.mocked(dependencies.prisma.$transaction).mockImplementation(
      async (callback) => {
        order.push("transaction-started");
        const result = await callback(transactionClient);
        order.push("transaction-committed");
        return result;
      },
    );
    vi.mocked(dependencies.runPublishAttempt).mockImplementation(async () => {
      order.push("worker-started");
    });

    await queuePublishForActor(
      {
        requestId: "request-123",
        actorUserId: "owner-123",
        source: "portal-ui",
      },
      dependencies,
    );

    expect(order).toEqual([
      "transaction-started",
      "transaction-committed",
      "worker-started",
    ]);
  });

  it("rechecks actor access immediately before claiming the publish", async () => {
    vi.mocked(dependencies.prisma.appRequest.findFirst)
      .mockResolvedValueOnce(generatedRequest)
      .mockResolvedValueOnce(null);

    await expect(
      queuePublishForActor(
        {
          requestId: "request-123",
          actorUserId: "collaborator-123",
          source: "portal-ui",
        },
        dependencies,
      ),
    ).rejects.toThrow("App request not found.");

    expect(dependencies.prisma.appRequest.findFirst).toHaveBeenCalledTimes(2);
    expect(dependencies.prisma.$transaction).not.toHaveBeenCalled();
    expect(dependencies.runPublishAttempt).not.toHaveBeenCalled();
  });

  it("rechecks actor access again at the background provider boundary", async () => {
    vi.mocked(dependencies.prisma.appRequest.findFirst)
      .mockResolvedValueOnce(generatedRequest)
      .mockResolvedValueOnce(generatedRequest)
      .mockResolvedValueOnce(null);

    await expect(
      queuePublishForActor(
        {
          requestId: "request-123",
          actorUserId: "collaborator-123",
          source: "portal-ui",
        },
        dependencies,
      ),
    ).rejects.toThrow("App request not found.");

    await vi.waitFor(() => {
      expect(dependencies.prisma.appRequest.findFirst).toHaveBeenCalledTimes(3);
    });
    expect(dependencies.runPublishAttempt).not.toHaveBeenCalled();
  });
});

async function firstTransactionClient(dependencies: QueuePublishDependencies) {
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
