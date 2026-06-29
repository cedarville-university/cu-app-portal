import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendAppNotification } from "./service";

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findUnique: vi.fn() },
    notificationDelivery: { create: vi.fn() },
  },
}));

const { prisma } = await import("@/lib/db");

describe("sendAppNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends to owner and collaborators except the actor", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      appName: "Campus Forms",
      supportReference: "CU-123",
      userId: "owner-123",
      user: {
        id: "owner-123",
        email: "owner@cedarville.edu",
        displayName: "Owner User",
        notificationPreference: null,
      },
      collaborators: [
        {
          user: {
            id: "collab-123",
            email: "collab@cedarville.edu",
            displayName: "Collaborator User",
            notificationPreference: null,
          },
        },
      ],
    } as never);
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await sendAppNotification({
      appRequestId: "request-123",
      eventKey: "REPOSITORY_READY",
      actorUserId: "owner-123",
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "collab@cedarville.edu" }),
    );
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: "collab@cedarville.edu",
          eventKey: "REPOSITORY_READY",
          category: "APP_LIFECYCLE",
          status: "SENT",
        }),
      }),
    );
  });

  it("records skipped delivery when preferences opt out", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      appName: "Campus Forms",
      supportReference: "CU-123",
      userId: "owner-123",
      user: {
        id: "owner-123",
        email: "owner@cedarville.edu",
        displayName: "Owner User",
        notificationPreference: {
          emailNotificationsEnabled: false,
          collaborationEmailsEnabled: true,
          appLifecycleEmailsEnabled: true,
          publishingEmailsEnabled: true,
        },
      },
      collaborators: [],
    } as never);
    const mailer = { send: vi.fn() };

    await sendAppNotification({
      appRequestId: "request-123",
      eventKey: "REPOSITORY_READY",
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(mailer.send).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: "owner@cedarville.edu",
          status: "SKIPPED",
        }),
      }),
    );
  });
});
