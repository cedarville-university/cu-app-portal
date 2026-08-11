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
    });
    expect(repairPublishingSetup).toHaveBeenCalledWith("request-123");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith("/download/request-123");
  });

  it("notifies when repair leaves publishing setup blocked", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
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
    });
    expect(repairPublishingSetup).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("repairs publishing setup for a collaborator with app access", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("collaborator-123");
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "owner-123",
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
    });
    expect(repairPublishingSetup).toHaveBeenCalledWith("request-123");
  });

  it("catches repair failures and revalidates the app views", async () => {
    const repairError = new Error("repair failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(repairPublishingSetup).mockRejectedValue(repairError);

    await expect(
      repairPublishingSetupAction("request-123"),
    ).resolves.toBeUndefined();

    expect(repairPublishingSetup).toHaveBeenCalledWith("request-123");
    expect(consoleError).toHaveBeenCalledWith(
      "Publishing setup repair failed.",
      { requestId: "request-123", error: repairError },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith("/download/request-123");
    consoleError.mockRestore();
  });
});
