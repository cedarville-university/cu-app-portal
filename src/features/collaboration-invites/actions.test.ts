import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServerSession } from "@/auth/session";
import { userHasAdminRole } from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { loadDirectoryConfig } from "@/features/directory/config";
import { createEntraDirectoryClient } from "@/features/directory/entra-directory";
import { loadSmtpConfig } from "@/features/notifications/config";
import { createSmtpMailer } from "@/features/notifications/mailer";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  acceptCollaborationInviteAction,
  resendCollaborationInviteAction,
  revokeCollaborationInviteAction,
  sendCollaborationInviteAction,
} from "./actions";

const mocks = vi.hoisted(() => ({
  directoryClient: {
    findEligibleUserByEmail: vi.fn(),
  },
  mailer: {
    send: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth/session", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/features/app-requests/access", () => ({
  userHasAdminRole: vi.fn(),
}));

vi.mock("@/features/directory/config", () => ({
  loadDirectoryConfig: vi.fn(),
}));

vi.mock("@/features/directory/entra-directory", () => ({
  createEntraDirectoryClient: vi.fn(() => mocks.directoryClient),
}));

vi.mock("@/features/notifications/config", () => ({
  loadSmtpConfig: vi.fn(),
}));

vi.mock("@/features/notifications/mailer", () => ({
  createSmtpMailer: vi.fn(() => mocks.mailer),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    appRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    collaborationInvite: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    notificationDelivery: {
      create: vi.fn(),
    },
    appAccess: {
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const ownerAppRequest = {
  id: "request-123",
  userId: "owner-123",
  appName: "Campus Forms",
  supportReference: "CU-123",
  user: {
    displayName: "Owner User",
    email: "owner@cedarville.edu",
  },
};

const ownerUser = {
  id: "owner-123",
  displayName: "Owner User",
  email: "owner@cedarville.edu",
};

const adminUser = {
  id: "admin-123",
  displayName: "Admin Actor",
  email: "admin@cedarville.edu",
};

const eligibleDirectoryUser = {
  entraOid: "entra-456",
  displayName: "Invited User",
  email: "invited@cedarville.edu",
  aliases: ["invited@cedarville.edu"],
};

function inviteForm(email = "Invited@Cedarville.edu") {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

describe("collaboration invite actions", () => {
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockClear();
    vi.mocked(resolveCurrentUserId).mockResolvedValue("owner-123");
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "invited-user-123",
        name: "Invited User",
        email: "invited@cedarville.edu",
        entraOid: "entra-456",
      },
      expires: "2099-01-01T00:00:00.000Z",
    });
    vi.mocked(userHasAdminRole).mockResolvedValue(false);
    vi.mocked(loadDirectoryConfig).mockReturnValue({
      tenantId: "tenant-123",
      clientId: "client-123",
      clientSecret: "secret-123",
      allowedEmailDomain: "cedarville.edu",
    });
    vi.mocked(loadSmtpConfig).mockReturnValue({
      appUrl: "https://portal.example.edu",
      host: "smtp.example.edu",
      port: 587,
      tlsMode: "starttls",
      from: "portal@example.edu",
    });
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      ownerAppRequest as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>,
    );
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue(
      ownerAppRequest as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>,
    );
    mocks.directoryClient.findEligibleUserByEmail.mockResolvedValue(
      eligibleDirectoryUser,
    );
    mocks.mailer.send.mockResolvedValue({
      provider: "smtp",
      providerMessageId: "mail-123",
    });
    vi.mocked(prisma.collaborationInvite.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.collaborationInvite.create).mockResolvedValue({
      id: "invite-123",
      appRequestId: "request-123",
      normalizedInvitedEmail: "invited@cedarville.edu",
      invitedEmail: "invited@cedarville.edu",
    } as Awaited<ReturnType<typeof prisma.collaborationInvite.create>>);
    vi.mocked(prisma.collaborationInvite.update).mockResolvedValue({
      id: "invite-123",
      appRequestId: "request-123",
      status: "PENDING",
    } as Awaited<ReturnType<typeof prisma.collaborationInvite.update>>);
    vi.mocked(prisma.collaborationInvite.updateMany).mockResolvedValue({
      count: 1,
    });
    vi.mocked(prisma.notificationDelivery.create).mockResolvedValue({
      id: "delivery-123",
    } as Awaited<ReturnType<typeof prisma.notificationDelivery.create>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      ownerUser as Awaited<ReturnType<typeof prisma.user.findUnique>>,
    );
    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: "invited-user-123",
      entraOid: "entra-456",
      email: "invited@cedarville.edu",
      displayName: "Invited User",
    } as Awaited<ReturnType<typeof prisma.user.upsert>>);
    vi.mocked(prisma.appAccess.upsert).mockResolvedValue({
      id: "access-123",
    } as Awaited<ReturnType<typeof prisma.appAccess.upsert>>);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      if (typeof callback !== "function") {
        throw new Error("Unexpected batch transaction in test.");
      }

      return callback(prisma);
    });
    vi.mocked(recordAuditEvent).mockResolvedValue(undefined);
  });

  it("lets an owner send an invite after directory validation", async () => {
    await sendCollaborationInviteAction("request-123", inviteForm());

    expect(mocks.directoryClient.findEligibleUserByEmail).toHaveBeenCalledWith(
      "invited@cedarville.edu",
    );
    expect(prisma.collaborationInvite.findFirst).toHaveBeenCalledWith({
      where: {
        appRequestId: "request-123",
        normalizedInvitedEmail: "invited@cedarville.edu",
        status: "PENDING",
      },
    });
    expect(prisma.collaborationInvite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appRequestId: "request-123",
        invitedEmail: "invited@cedarville.edu",
        normalizedInvitedEmail: "invited@cedarville.edu",
        invitedEntraOid: "entra-456",
        invitedDisplayName: "Invited User",
        inviterUserId: "owner-123",
        status: "PENDING",
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
        lastSentAt: expect.any(Date),
      }),
    });
    expect(mocks.mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Owner User"),
        text: expect.stringContaining(
          "Owner User invited you to collaborate on Campus Forms",
        ),
      }),
    );
  });

  it("uses the admin actor as the inviter when an admin sends an invite", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("admin-123");
    vi.mocked(userHasAdminRole).mockResolvedValue(true);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      adminUser as Awaited<ReturnType<typeof prisma.user.findUnique>>,
    );

    await sendCollaborationInviteAction("request-123", inviteForm());

    expect(mocks.mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Admin Actor"),
        text: expect.stringContaining(
          "Admin Actor invited you to collaborate on Campus Forms",
        ),
      }),
    );
    expect(mocks.mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.not.stringContaining("Owner User"),
        text: expect.not.stringContaining("Owner User invited"),
      }),
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "COLLABORATION_INVITE_SENT",
      expect.objectContaining({
        actorUserId: "admin-123",
        inviterEmail: "admin@cedarville.edu",
      }),
    );
  });

  it("refreshes the pending invite when concurrent send hits the pending unique index", async () => {
    vi.mocked(prisma.collaborationInvite.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "invite-123",
      } as Awaited<ReturnType<typeof prisma.collaborationInvite.findFirst>>);
    vi.mocked(prisma.collaborationInvite.create).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: "CollaborationInvite_pending_app_email_key" },
      }),
    );

    await sendCollaborationInviteAction(
      "request-123",
      inviteForm("invited@cedarville.edu"),
    );

    expect(prisma.collaborationInvite.updateMany).toHaveBeenCalledWith({
      where: {
        id: "invite-123",
        appRequestId: "request-123",
        status: "PENDING",
      },
      data: expect.objectContaining({
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
        lastSentAt: expect.any(Date),
      }),
    });
  });

  it("refreshes a pending invite when Prisma reports the pending unique conflict as fields", async () => {
    vi.mocked(prisma.collaborationInvite.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "invite-123",
        tokenHash: "old-token-hash",
        expiresAt: new Date("2026-07-01T12:00:00Z"),
        lastSentAt: new Date("2026-06-20T12:00:00Z"),
      } as Awaited<ReturnType<typeof prisma.collaborationInvite.findFirst>>);
    vi.mocked(prisma.collaborationInvite.create).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["appRequestId", "normalizedInvitedEmail"] },
      }),
    );

    await expect(
      sendCollaborationInviteAction(
        "request-123",
        inviteForm("invited@cedarville.edu"),
      ),
    ).resolves.toEqual({ deliveryStatus: "SENT" });

    expect(prisma.collaborationInvite.updateMany).toHaveBeenCalledWith({
      where: {
        id: "invite-123",
        appRequestId: "request-123",
        status: "PENDING",
      },
      data: expect.objectContaining({
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
        lastSentAt: expect.any(Date),
      }),
    });
  });

  it("rejects collaborators who are not owners or admins", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("collaborator-123");
    vi.mocked(userHasAdminRole).mockResolvedValue(false);
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

    await expect(
      sendCollaborationInviteAction("request-123", inviteForm()),
    ).rejects.toThrow(
      "Only owners and admins can manage collaboration invites.",
    );

    expect(prisma.collaborationInvite.create).not.toHaveBeenCalled();
  });

  it("shows a friendly lookup message when Entra directory settings are missing", async () => {
    vi.mocked(loadDirectoryConfig).mockImplementationOnce(() => {
      throw new Error("Missing Entra directory configuration.");
    });

    await expect(
      sendCollaborationInviteAction("request-123", inviteForm()),
    ).rejects.toThrow(
      "The portal is unable to look up that email address right now.",
    );

    expect(createEntraDirectoryClient).not.toHaveBeenCalled();
    expect(prisma.collaborationInvite.create).not.toHaveBeenCalled();
    expect(mocks.mailer.send).not.toHaveBeenCalled();
  });

  it("revokes a pending invite", async () => {
    await revokeCollaborationInviteAction("request-123", "invite-123");

    expect(prisma.collaborationInvite.update).toHaveBeenCalledWith({
      where: {
        id: "invite-123",
        appRequestId: "request-123",
        status: "PENDING",
      },
      data: expect.objectContaining({
        status: "REVOKED",
        revokedAt: expect.any(Date),
        tokenHash: expect.any(String),
      }),
    });
  });

  it("resends a pending invite and reports sent delivery", async () => {
    const previousExpiresAt = new Date("2026-07-01T12:00:00Z");
    const previousLastSentAt = new Date("2026-06-20T12:00:00Z");
    vi.mocked(prisma.collaborationInvite.findFirst).mockResolvedValueOnce({
      id: "invite-123",
      appRequestId: "request-123",
      invitedEmail: "invited@cedarville.edu",
      tokenHash: "old-token-hash",
      expiresAt: previousExpiresAt,
      lastSentAt: previousLastSentAt,
      status: "PENDING",
    } as Awaited<ReturnType<typeof prisma.collaborationInvite.findFirst>>);

    await expect(
      resendCollaborationInviteAction("request-123", "invite-123"),
    ).resolves.toEqual({ deliveryStatus: "SENT" });

    expect(prisma.collaborationInvite.updateMany).toHaveBeenCalledWith({
      where: { id: "invite-123", appRequestId: "request-123", status: "PENDING" },
      data: expect.objectContaining({
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
        lastSentAt: expect.any(Date),
      }),
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "COLLABORATION_INVITE_RESENT",
      expect.objectContaining({ deliveryStatus: "SENT" }),
    );
  });

  it("uses the admin actor as the inviter when an admin resends an invite", async () => {
    const previousExpiresAt = new Date("2026-07-01T12:00:00Z");
    const previousLastSentAt = new Date("2026-06-20T12:00:00Z");
    vi.mocked(resolveCurrentUserId).mockResolvedValue("admin-123");
    vi.mocked(userHasAdminRole).mockResolvedValue(true);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      adminUser as Awaited<ReturnType<typeof prisma.user.findUnique>>,
    );
    vi.mocked(prisma.collaborationInvite.findFirst).mockResolvedValueOnce({
      id: "invite-123",
      appRequestId: "request-123",
      invitedEmail: "invited@cedarville.edu",
      tokenHash: "old-token-hash",
      expiresAt: previousExpiresAt,
      lastSentAt: previousLastSentAt,
      status: "PENDING",
    } as Awaited<ReturnType<typeof prisma.collaborationInvite.findFirst>>);

    await resendCollaborationInviteAction("request-123", "invite-123");

    expect(mocks.mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Admin Actor"),
        text: expect.stringContaining(
          "Admin Actor invited you to collaborate on Campus Forms",
        ),
      }),
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "COLLABORATION_INVITE_RESENT",
      expect.objectContaining({
        actorUserId: "admin-123",
        inviterEmail: "admin@cedarville.edu",
      }),
    );
  });

  it("keeps the pending invite and restores the old resend token when SMTP fails", async () => {
    const previousExpiresAt = new Date("2026-07-01T12:00:00Z");
    const previousLastSentAt = new Date("2026-06-20T12:00:00Z");
    vi.mocked(prisma.collaborationInvite.findFirst).mockResolvedValueOnce({
      id: "invite-123",
      appRequestId: "request-123",
      invitedEmail: "invited@cedarville.edu",
      tokenHash: "old-token-hash",
      expiresAt: previousExpiresAt,
      lastSentAt: previousLastSentAt,
      status: "PENDING",
    } as Awaited<ReturnType<typeof prisma.collaborationInvite.findFirst>>);
    mocks.mailer.send.mockRejectedValueOnce(new Error("SMTP unavailable"));

    await expect(
      resendCollaborationInviteAction("request-123", "invite-123"),
    ).resolves.toEqual({ deliveryStatus: "FAILED" });

    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKey: "COLLABORATION_INVITE_SENT",
        category: "COLLABORATION",
        status: "FAILED",
        provider: "smtp",
        recipientEmail: "invited@cedarville.edu",
        errorSummary: "SMTP unavailable",
      }),
    });
    expect(prisma.collaborationInvite.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "invite-123",
        appRequestId: "request-123",
        status: "PENDING",
        tokenHash: expect.any(String),
      },
      data: {
        tokenHash: "old-token-hash",
        expiresAt: previousExpiresAt,
        lastSentAt: previousLastSentAt,
      },
    });
  });

  it("restores the old pending invite token when refreshed send delivery fails", async () => {
    const previousExpiresAt = new Date("2026-07-01T12:00:00Z");
    const previousLastSentAt = new Date("2026-06-20T12:00:00Z");
    vi.mocked(prisma.collaborationInvite.findFirst).mockResolvedValueOnce({
      id: "invite-123",
      appRequestId: "request-123",
      invitedEmail: "invited@cedarville.edu",
      normalizedInvitedEmail: "invited@cedarville.edu",
      tokenHash: "old-token-hash",
      expiresAt: previousExpiresAt,
      lastSentAt: previousLastSentAt,
      status: "PENDING",
    } as Awaited<ReturnType<typeof prisma.collaborationInvite.findFirst>>);
    mocks.mailer.send.mockRejectedValueOnce(new Error("SMTP unavailable"));

    await expect(
      sendCollaborationInviteAction("request-123", inviteForm()),
    ).resolves.toEqual({ deliveryStatus: "FAILED" });

    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKey: "COLLABORATION_INVITE_SENT",
        category: "COLLABORATION",
        status: "FAILED",
        provider: "smtp",
        recipientEmail: "invited@cedarville.edu",
        errorSummary: "SMTP unavailable",
      }),
    });
    expect(prisma.collaborationInvite.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "invite-123",
        appRequestId: "request-123",
        status: "PENDING",
        tokenHash: expect.any(String),
      },
      data: {
        tokenHash: "old-token-hash",
        expiresAt: previousExpiresAt,
        lastSentAt: previousLastSentAt,
      },
    });
  });

  it("accepts a pending invite for the matching signed-in user", async () => {
    vi.mocked(prisma.collaborationInvite.findFirst).mockResolvedValue({
      id: "invite-123",
      appRequestId: "request-123",
      invitedEntraOid: "entra-456",
      normalizedInvitedEmail: "invited@cedarville.edu",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1000 * 60),
    } as Awaited<ReturnType<typeof prisma.collaborationInvite.findFirst>>);

    await expect(
      acceptCollaborationInviteAction("token-123"),
    ).resolves.toBe("request-123");

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { entraOid: "entra-456" },
      update: {
        email: "invited@cedarville.edu",
        displayName: "Invited User",
      },
      create: {
        entraOid: "entra-456",
        email: "invited@cedarville.edu",
        displayName: "Invited User",
      },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.appAccess.upsert).toHaveBeenCalledWith({
      where: {
        appRequestId_userId: {
          appRequestId: "request-123",
          userId: "invited-user-123",
        },
      },
      update: {},
      create: { appRequestId: "request-123", userId: "invited-user-123" },
    });
    expect(prisma.collaborationInvite.updateMany).toHaveBeenCalledWith({
      where: {
        id: "invite-123",
        tokenHash: expect.any(String),
        status: "PENDING",
        expiresAt: { gt: expect.any(Date) },
      },
      data: expect.objectContaining({
        status: "ACCEPTED",
        invitedUserId: "invited-user-123",
        acceptedAt: expect.any(Date),
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/download/request-123");
  });

  it("requires the actual session identity when accepting an invite", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "other-user-123",
        name: "Wrong User",
        email: "wrong@cedarville.edu",
        entraOid: "entra-999",
      },
      expires: "2099-01-01T00:00:00.000Z",
    });
    vi.mocked(prisma.collaborationInvite.findFirst).mockResolvedValue({
      id: "invite-123",
      appRequestId: "request-123",
      invitedEntraOid: "entra-456",
      normalizedInvitedEmail: "invited@cedarville.edu",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1000 * 60),
    } as Awaited<ReturnType<typeof prisma.collaborationInvite.findFirst>>);

    await expect(acceptCollaborationInviteAction("token-123")).rejects.toThrow(
      "Sign in with the invited Cedarville account to accept this invite.",
    );

    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.appAccess.upsert).not.toHaveBeenCalled();
  });

  it("guards expired invite marking by token hash, status, and expiry", async () => {
    vi.mocked(prisma.collaborationInvite.findFirst).mockResolvedValue({
      id: "invite-123",
      appRequestId: "request-123",
      invitedEntraOid: "entra-456",
      normalizedInvitedEmail: "invited@cedarville.edu",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 1000 * 60),
    } as Awaited<ReturnType<typeof prisma.collaborationInvite.findFirst>>);

    await expect(acceptCollaborationInviteAction("token-123")).rejects.toThrow(
      "This collaboration invite is no longer valid.",
    );

    expect(prisma.collaborationInvite.updateMany).toHaveBeenCalledWith({
      where: {
        id: "invite-123",
        tokenHash: expect.any(String),
        status: "PENDING",
        expiresAt: { lte: expect.any(Date) },
      },
      data: {
        status: "EXPIRED",
      },
    });
  });

  it("does not grant access when the guarded accept transition affects no rows", async () => {
    vi.mocked(prisma.collaborationInvite.findFirst).mockResolvedValue({
      id: "invite-123",
      appRequestId: "request-123",
      invitedEntraOid: "entra-456",
      normalizedInvitedEmail: "invited@cedarville.edu",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1000 * 60),
    } as Awaited<ReturnType<typeof prisma.collaborationInvite.findFirst>>);
    vi.mocked(prisma.collaborationInvite.updateMany).mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      acceptCollaborationInviteAction("token-123"),
    ).rejects.toThrow("This collaboration invite is no longer valid.");

    expect(prisma.appAccess.upsert).not.toHaveBeenCalled();
  });

  it("does not fail send when audit logging fails", async () => {
    vi.mocked(recordAuditEvent).mockRejectedValueOnce(
      new Error("audit unavailable"),
    );

    await expect(
      sendCollaborationInviteAction("request-123", inviteForm()),
    ).resolves.toEqual({ deliveryStatus: "SENT" });
  });
});
