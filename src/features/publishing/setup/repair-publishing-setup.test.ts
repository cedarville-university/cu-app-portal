// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appAccessWhere } from "@/features/app-requests/access";
import { getPublishingSetupRepairEligibility } from "@/features/publishing/eligibility";
import {
  repairPublishingSetupForActor,
  type RepairPublishingSetupDependencies,
} from "./repair-publishing-setup";

const repairableRequest = {
  id: "request-123",
  sourceOfTruth: "PORTAL_MANAGED_REPO" as const,
  repositoryStatus: "READY" as const,
  publishStatus: "FAILED" as const,
  publishingSetupStatus: "NEEDS_REPAIR" as const,
  publishingSetupErrorSummary: "Previous safe summary.",
  repositoryImport: null,
};

function createDependencies(): RepairPublishingSetupDependencies {
  return {
    prisma: {
      appRequest: {
        findFirst: vi.fn().mockResolvedValue(repairableRequest),
        findUnique: vi.fn().mockResolvedValue({
          publishingSetupStatus: "READY",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    },
    appAccessWhere: vi.fn(appAccessWhere),
    userHasAdminRole: vi.fn().mockResolvedValue(false),
    getPublishingSetupRepairEligibility,
    repairPublishingSetup: vi.fn().mockResolvedValue(undefined),
    safeNotifyAppEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as RepairPublishingSetupDependencies;
}

describe("repairPublishingSetupForActor", () => {
  let dependencies: RepairPublishingSetupDependencies;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dependencies = createDependencies();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it.each([
    ["owner-123", false],
    ["collaborator-123", false],
    ["admin-123", true],
  ])("repairs for an authorized %s actor", async (actorUserId, isAdmin) => {
    vi.mocked(dependencies.userHasAdminRole).mockResolvedValue(isAdmin);

    await expect(
      repairPublishingSetupForActor(
        {
          requestId: "request-123",
          actorUserId,
          source: "codex-mcp",
        },
        dependencies,
      ),
    ).resolves.toEqual({ status: "READY" });

    expect(dependencies.appAccessWhere).toHaveBeenLastCalledWith(
      "request-123",
      actorUserId,
      isAdmin,
    );
  });

  it("uses the same quiet not-found result for a foreign or missing app", async () => {
    vi.mocked(dependencies.prisma.appRequest.findFirst).mockResolvedValue(null);

    const missing = await repairPublishingSetupForActor(
      {
        requestId: "missing",
        actorUserId: "actor-123",
        source: "codex-mcp",
      },
      dependencies,
    ).catch((error: unknown) => error);
    const foreign = await repairPublishingSetupForActor(
      {
        requestId: "foreign",
        actorUserId: "actor-123",
        source: "codex-mcp",
      },
      dependencies,
    ).catch((error: unknown) => error);

    expect(missing).toEqual(foreign);
    expect(missing).toEqual(new Error("App request not found."));
    expect(dependencies.prisma.appRequest.updateMany).not.toHaveBeenCalled();
    expect(dependencies.repairPublishingSetup).not.toHaveBeenCalled();
  });

  it("atomically claims setup state and passes the claim identity to the provider service", async () => {
    await repairPublishingSetupForActor(
      {
        requestId: "request-123",
        actorUserId: "owner-123",
        source: "portal-ui",
      },
      dependencies,
    );

    expect(dependencies.prisma.appRequest.updateMany).toHaveBeenNthCalledWith(
      1,
      {
        where: {
          id: "request-123",
          publishingSetupStatus: "NEEDS_REPAIR",
        },
        data: {
          publishingSetupStatus: "REPAIRING",
          publishingSetupErrorSummary: null,
          updatedAt: expect.any(Date),
        },
      },
    );
    const attemptClaimedAt = vi.mocked(
      dependencies.prisma.appRequest.updateMany,
    ).mock.calls[0]?.[0].data.updatedAt;
    expect(dependencies.repairPublishingSetup).toHaveBeenCalledWith(
      "request-123",
      undefined,
      { statusAlreadyClaimed: true, attemptClaimedAt },
    );
  });

  it("rejects a duplicate stale claim before any provider mutation", async () => {
    vi.mocked(dependencies.prisma.appRequest.updateMany).mockResolvedValue({
      count: 0,
    });

    await expect(
      repairPublishingSetupForActor(
        {
          requestId: "request-123",
          actorUserId: "owner-123",
          source: "portal-ui",
        },
        dependencies,
      ),
    ).rejects.toThrow(
      "Publishing setup is already being checked or repaired.",
    );

    expect(dependencies.repairPublishingSetup).not.toHaveBeenCalled();
  });

  it("rechecks actor access immediately before provider setup mutations", async () => {
    vi.mocked(dependencies.prisma.appRequest.findFirst)
      .mockResolvedValueOnce(repairableRequest)
      .mockResolvedValueOnce(null);

    await expect(
      repairPublishingSetupForActor(
        {
          requestId: "request-123",
          actorUserId: "collaborator-123",
          source: "portal-ui",
        },
        dependencies,
      ),
    ).rejects.toThrow("App request not found.");

    expect(dependencies.repairPublishingSetup).not.toHaveBeenCalled();
    expect(dependencies.prisma.appRequest.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "request-123",
        publishingSetupStatus: "REPAIRING",
        updatedAt: expect.any(Date),
      },
      data: {
        publishingSetupStatus: "NEEDS_REPAIR",
        publishingSetupErrorSummary: "Previous safe summary.",
      },
    });
  });

  it("returns BLOCKED and notifies only the explicit actor when repair remains blocked", async () => {
    vi.mocked(dependencies.prisma.appRequest.findUnique).mockResolvedValue({
      publishingSetupStatus: "BLOCKED",
    });

    await expect(
      repairPublishingSetupForActor(
        {
          requestId: "request-123",
          actorUserId: "collaborator-123",
          source: "codex-mcp",
        },
        dependencies,
      ),
    ).resolves.toEqual({ status: "BLOCKED" });

    expect(dependencies.safeNotifyAppEvent).toHaveBeenCalledWith({
      appRequestId: "request-123",
      eventKey: "PUBLISHING_SETUP_BLOCKED",
      actorUserId: "collaborator-123",
      directRecipientUserIds: ["collaborator-123"],
    });
  });

  it("does not misclassify a completed repair when status inspection fails", async () => {
    vi.mocked(dependencies.prisma.appRequest.findUnique).mockRejectedValue(
      new Error("database inspection unavailable"),
    );

    await expect(
      repairPublishingSetupForActor(
        {
          requestId: "request-123",
          actorUserId: "owner-123",
          source: "portal-ui",
        },
        dependencies,
      ),
    ).resolves.toEqual({ status: "NEEDS_REPAIR" });

    expect(dependencies.prisma.appRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(dependencies.safeNotifyAppEvent).not.toHaveBeenCalled();
  });

  it("persists a safe failure state without returning or logging provider details", async () => {
    vi.mocked(dependencies.repairPublishingSetup).mockRejectedValue(
      new Error("Azure secret=PROVIDER_SECRET"),
    );

    await expect(
      repairPublishingSetupForActor(
        {
          requestId: "request-123",
          actorUserId: "owner-123",
          source: "codex-mcp",
        },
        dependencies,
      ),
    ).resolves.toEqual({ status: "NEEDS_REPAIR" });

    expect(dependencies.prisma.appRequest.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "request-123",
        publishingSetupStatus: "REPAIRING",
        updatedAt: expect.any(Date),
      },
      data: {
        publishingSetupStatus: "NEEDS_REPAIR",
        publishingSetupErrorSummary:
          "Publishing setup could not be completed. Share the support reference with the portal support team.",
      },
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "PROVIDER_SECRET",
    );
  });

  it("treats a stale provider outcome as a no-op without rollback or notification", async () => {
    const staleError = new Error(
      "This publishing setup repair attempt is no longer current.",
    );
    staleError.name = "StalePublishingSetupRepairAttemptError";
    vi.mocked(dependencies.repairPublishingSetup).mockRejectedValue(staleError);
    vi.mocked(dependencies.prisma.appRequest.findUnique).mockResolvedValue({
      publishingSetupStatus: "READY",
    });

    await expect(
      repairPublishingSetupForActor(
        {
          requestId: "request-123",
          actorUserId: "owner-123",
          source: "portal-ui",
        },
        dependencies,
      ),
    ).resolves.toEqual({ status: "READY" });

    expect(dependencies.prisma.appRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(dependencies.safeNotifyAppEvent).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      "Publishing setup repair attempt skipped after its claim changed.",
      { requestId: "request-123", source: "portal-ui" },
    );
  });

  it("rejects ineligible setup repair without implicitly publishing or repairing", async () => {
    vi.mocked(dependencies.prisma.appRequest.findFirst).mockResolvedValue({
      ...repairableRequest,
      publishStatus: "QUEUED",
    });

    await expect(
      repairPublishingSetupForActor(
        {
          requestId: "request-123",
          actorUserId: "owner-123",
          source: "portal-ui",
        },
        dependencies,
      ),
    ).rejects.toThrow(
      "Publishing setup cannot be changed while publishing is active or unavailable.",
    );

    expect(dependencies.prisma.appRequest.updateMany).not.toHaveBeenCalled();
    expect(dependencies.repairPublishingSetup).not.toHaveBeenCalled();
  });
});
