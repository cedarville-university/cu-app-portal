import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendAppNotification,
  sendDeletedAppNotificationSnapshot,
} from "./service";

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    notificationDelivery: { create: vi.fn() },
  },
}));

const { prisma } = await import("@/lib/db");

describe("sendAppNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("sends to the actor when they are a direct recipient", async () => {
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
      eventKey: "COLLABORATION_INVITE_SENT",
      actorUserId: "owner-123",
      directRecipientUserIds: ["owner-123"],
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@cedarville.edu" }),
    );
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "collab@cedarville.edu" }),
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

  it("escapes HTML app names and links to the download page", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      appName: '<script>alert("x")</script>',
      supportReference: "CU-123",
      userId: "owner-123",
      user: {
        id: "owner-123",
        email: "owner@cedarville.edu",
        displayName: "Owner User",
        notificationPreference: null,
      },
      collaborators: [],
    } as never);
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await sendAppNotification({
      appRequestId: "request-123",
      eventKey: "REPOSITORY_READY",
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
        ),
      }),
    );
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          'href="https://portal.example.edu/download/request-123"',
        ),
      }),
    );
    expect(mailer.send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("<script>"),
      }),
    );
    expect(mailer.send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("/apps/request-123"),
      }),
    );
  });

  it("loads and emails a direct recipient who is not an app participant", async () => {
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
      collaborators: [],
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "direct-123",
        email: "direct@cedarville.edu",
        displayName: "Direct User",
        notificationPreference: null,
      },
    ] as never);
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await sendAppNotification({
      appRequestId: "request-123",
      eventKey: "COLLABORATION_INVITE_SENT",
      actorUserId: "owner-123",
      directRecipientUserIds: ["direct-123"],
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["direct-123"] } },
      }),
    );
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "direct@cedarville.edu" }),
    );
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientUserId: "direct-123",
          recipientEmail: "direct@cedarville.edu",
          status: "SENT",
        }),
      }),
    );
  });

  it("bypasses opt-out preferences for access and invite events", async () => {
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
      collaborators: [],
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "direct-123",
        email: "direct@cedarville.edu",
        displayName: "Direct User",
        notificationPreference: {
          emailNotificationsEnabled: false,
          collaborationEmailsEnabled: false,
          appLifecycleEmailsEnabled: false,
          publishingEmailsEnabled: false,
        },
      },
    ] as never);
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await sendAppNotification({
      appRequestId: "request-123",
      eventKey: "COLLABORATION_INVITE_SENT",
      actorUserId: "owner-123",
      directRecipientUserIds: ["direct-123"],
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "direct@cedarville.edu" }),
    );
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: "direct@cedarville.edu",
          status: "SENT",
        }),
      }),
    );
  });

  it("does not record failed delivery when the sent log fails", async () => {
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
      collaborators: [],
    } as never);
    vi.mocked(prisma.notificationDelivery.create).mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await expect(
      sendAppNotification({
        appRequestId: "request-123",
        eventKey: "REPOSITORY_READY",
        mailer,
        appUrl: "https://portal.example.edu",
      }),
    ).resolves.toBeUndefined();

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(prisma.notificationDelivery.create).toHaveBeenCalledTimes(1);
    expect(prisma.notificationDelivery.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to record notification delivery.",
      expect.any(Error),
    );
  });

  it("does not reject when failed delivery logging fails after mail failure", async () => {
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
      collaborators: [],
    } as never);
    vi.mocked(prisma.notificationDelivery.create).mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const mailer = {
      send: vi.fn().mockRejectedValue(new Error("SMTP unavailable")),
    };

    await expect(
      sendAppNotification({
        appRequestId: "request-123",
        eventKey: "REPOSITORY_READY",
        mailer,
        appUrl: "https://portal.example.edu",
      }),
    ).resolves.toBeUndefined();

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: "owner@cedarville.edu",
          status: "FAILED",
          errorSummary: "SMTP unavailable",
        }),
      }),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to record notification delivery.",
      expect.any(Error),
    );
  });
});

describe("sendDeletedAppNotificationSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends APP_DELETED from a snapshot without loading the deleted app row", async () => {
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await sendDeletedAppNotificationSnapshot({
      appRequestId: "request-deleted",
      appName: "Campus Forms",
      actorUserId: "owner-123",
      recipients: [
        {
          id: "owner-123",
          email: "owner@cedarville.edu",
          displayName: "Owner User",
          notificationPreference: null,
        },
        {
          id: "collab-123",
          email: "collab@cedarville.edu",
          displayName: "Collaborator User",
          notificationPreference: null,
        },
      ],
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(prisma.appRequest.findUnique).not.toHaveBeenCalled();
    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@cedarville.edu",
        text: expect.stringContaining("/download/request-deleted"),
      }),
    );
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "collab@cedarville.edu" }),
    );
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appRequestId: null,
        recipientUserId: "owner-123",
        eventKey: "APP_DELETED",
        category: "APP_LIFECYCLE",
        status: "SENT",
      }),
    });
  });

  it("respects app lifecycle preferences for deletion snapshots", async () => {
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await sendDeletedAppNotificationSnapshot({
      appRequestId: "request-deleted",
      appName: "Campus Forms",
      recipients: [
        {
          id: "owner-123",
          email: "owner@cedarville.edu",
          displayName: "Owner User",
          notificationPreference: {
            emailNotificationsEnabled: true,
            collaborationEmailsEnabled: true,
            appLifecycleEmailsEnabled: false,
            publishingEmailsEnabled: true,
          },
        },
      ],
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(mailer.send).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appRequestId: null,
        recipientUserId: "owner-123",
        eventKey: "APP_DELETED",
        category: "APP_LIFECYCLE",
        status: "SKIPPED",
      }),
    });
  });
});
