import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { prisma } from "@/lib/db";
import { repairPublishingSetupAction } from "./actions";
import { repairPublishingSetup } from "./service";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/features/notifications/safe-notify", () => ({
  safeNotifyAppEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    userRole: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("./service", () => ({
  repairPublishingSetup: vi.fn(),
}));

describe("publishing setup actions", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockReset();
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(prisma.appRequest.findFirst).mockReset();
    vi.mocked(prisma.appRequest.findUnique).mockReset();
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      publishingSetupStatus: "READY",
    } as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>);
    vi.mocked(prisma.appRequest.updateMany).mockReset();
    vi.mocked(prisma.appRequest.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.userRole.findFirst).mockReset();
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
    vi.mocked(repairPublishingSetup).mockReset();
    vi.mocked(safeNotifyAppEvent).mockReset();
  });

  it("repairs publishing setup for an owned app request", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "NEEDS_REPAIR",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(repairPublishingSetup).mockResolvedValue(undefined);

    await repairPublishingSetupAction("request-123");

    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith({
      where: {
        id: "request-123",
        OR: [
          { userId: "user-123" },
          {
            collaborators: {
              some: { userId: "user-123" },
            },
          },
        ],
      },
      include: { repositoryImport: true },
    });
    expect(repairPublishingSetup).toHaveBeenCalledWith(
      "request-123",
      undefined,
      { statusAlreadyClaimed: true },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith("/download/request-123");
    expect(revalidatePath).toHaveBeenCalledWith(
      "/onboarding/request-123",
    );
  });

  it("notifies when repair leaves publishing setup blocked", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      publishStatus: "FAILED",
      publishingSetupStatus: "NEEDS_REPAIR",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      publishingSetupStatus: "BLOCKED",
    } as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>);
    vi.mocked(repairPublishingSetup).mockResolvedValue(undefined);

    await repairPublishingSetupAction("request-123");

    expect(safeNotifyAppEvent).toHaveBeenCalledWith({
      appRequestId: "request-123",
      eventKey: "PUBLISHING_SETUP_BLOCKED",
      actorUserId: "user-123",
      directRecipientUserIds: ["user-123"],
    });
  });

  it("rejects missing or unauthorized app requests without repairing setup", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

    await expect(repairPublishingSetupAction("request-123")).rejects.toThrow(
      "App request not found.",
    );

    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith({
      where: {
        id: "request-123",
        OR: [
          { userId: "user-123" },
          {
            collaborators: {
              some: { userId: "user-123" },
            },
          },
        ],
      },
      include: { repositoryImport: true },
    });
    expect(repairPublishingSetup).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects setup repair while the managed repository is not ready", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "PENDING",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "NEEDS_REPAIR",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(repairPublishingSetupAction("request-123")).rejects.toThrow(
      "Managed repository is not ready for publishing setup.",
    );

    expect(repairPublishingSetup).not.toHaveBeenCalled();
  });

  it("rejects duplicate setup repair while setup work is in progress", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      publishStatus: "FAILED",
      publishingSetupStatus: "REPAIRING",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(repairPublishingSetupAction("request-123")).rejects.toThrow(
      "Publishing setup is already being checked or repaired.",
    );

    expect(repairPublishingSetup).not.toHaveBeenCalled();
  });

  it("rejects setup work before imported preparation is committed", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "NOT_CHECKED",
      repositoryImport: { preparationStatus: "FAILED" },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(repairPublishingSetupAction("request-123")).rejects.toThrow(
      "Imported repository preparation must be committed before publishing setup.",
    );

    expect(repairPublishingSetup).not.toHaveBeenCalled();
  });

  it.each(["QUEUED", "PROVISIONING", "DEPLOYING", "DELETED"] as const)(
    "rejects setup work for the unrelated %s publish state",
    async (publishStatus) => {
      vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
      vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
        id: "request-123",
        userId: "user-123",
        repositoryStatus: "READY",
        sourceOfTruth: "PORTAL_MANAGED_REPO",
        publishStatus,
        publishingSetupStatus: "NEEDS_REPAIR",
      } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

      await expect(repairPublishingSetupAction("request-123")).rejects.toThrow(
        "Publishing setup cannot be changed while publishing is active or unavailable.",
      );

      expect(repairPublishingSetup).not.toHaveBeenCalled();
    },
  );

  it("rejects setup work that is already ready", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      publishStatus: "SUCCEEDED",
      publishingSetupStatus: "READY",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(repairPublishingSetupAction("request-123")).rejects.toThrow(
      "Publishing setup cannot be started or repaired from its current state.",
    );

    expect(repairPublishingSetup).not.toHaveBeenCalled();
  });

  it.each(["NOT_CHECKED", "NEEDS_REPAIR", "BLOCKED"] as const)(
    "starts valid setup work for %s",
    async (publishingSetupStatus) => {
      vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
      vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
        id: "request-123",
        userId: "user-123",
        repositoryStatus: "READY",
        sourceOfTruth: "PORTAL_MANAGED_REPO",
        publishStatus: "NOT_STARTED",
        publishingSetupStatus,
      } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
      vi.mocked(repairPublishingSetup).mockResolvedValue(undefined);

      await repairPublishingSetupAction("request-123");

      expect(prisma.appRequest.updateMany).toHaveBeenCalledWith({
        where: {
          id: "request-123",
          publishingSetupStatus,
        },
        data: expect.objectContaining({
          publishingSetupStatus: "REPAIRING",
          publishingSetupErrorSummary: null,
          updatedAt: expect.any(Date),
        }),
      });
      expect(repairPublishingSetup).toHaveBeenCalledWith(
        "request-123",
        undefined,
        { statusAlreadyClaimed: true },
      );
    },
  );

  it("starts initial setup after imported preparation is committed", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "NOT_CHECKED",
      repositoryImport: { preparationStatus: "COMMITTED" },
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(repairPublishingSetup).mockResolvedValue(undefined);

    await repairPublishingSetupAction("request-123");

    expect(repairPublishingSetup).toHaveBeenCalledWith(
      "request-123",
      undefined,
      { statusAlreadyClaimed: true },
    );
  });

  it("repairs publishing setup for a collaborator with app access", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("collaborator-123");
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "owner-123",
      repositoryStatus: "READY",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      publishStatus: "FAILED",
      publishingSetupStatus: "NEEDS_REPAIR",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(repairPublishingSetup).mockResolvedValue(undefined);

    await repairPublishingSetupAction("request-123");

    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith({
      where: {
        id: "request-123",
        OR: [
          { userId: "collaborator-123" },
          {
            collaborators: {
              some: { userId: "collaborator-123" },
            },
          },
        ],
      },
      include: { repositoryImport: true },
    });
    expect(repairPublishingSetup).toHaveBeenCalledWith(
      "request-123",
      undefined,
      { statusAlreadyClaimed: true },
    );
  });

  it("catches repair failures and revalidates the app views", async () => {
    const repairError = new Error("repair failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      publishStatus: "FAILED",
      publishingSetupStatus: "NEEDS_REPAIR",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(repairPublishingSetup).mockRejectedValue(repairError);

    await expect(
      repairPublishingSetupAction("request-123"),
    ).resolves.toBeUndefined();

    expect(repairPublishingSetup).toHaveBeenCalledWith(
      "request-123",
      undefined,
      { statusAlreadyClaimed: true },
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Publishing setup repair failed.",
      { requestId: "request-123", error: repairError },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith("/download/request-123");
    expect(prisma.appRequest.updateMany).toHaveBeenLastCalledWith({
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
    consoleError.mockRestore();
  });

  it("allows only one duplicate submission to mutate external setup", async () => {
    let finishRepair!: () => void;
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      repositoryStatus: "READY",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      publishStatus: "FAILED",
      publishingSetupStatus: "NEEDS_REPAIR",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.appRequest.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    vi.mocked(repairPublishingSetup).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRepair = resolve;
      }),
    );

    const first = repairPublishingSetupAction("request-123");
    await vi.waitFor(() => {
      expect(repairPublishingSetup).toHaveBeenCalledTimes(1);
    });

    await expect(
      repairPublishingSetupAction("request-123"),
    ).rejects.toThrow(/already being checked or repaired/i);
    expect(repairPublishingSetup).toHaveBeenCalledTimes(1);

    finishRepair();
    await first;
  });
});
