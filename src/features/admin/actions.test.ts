import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  addAppCollaboratorAction,
  grantAdminRoleAction,
  reassignAppOwnerAction,
  removeAdminRoleAction,
  removeAppCollaboratorAction,
} from "./actions";
import { requireAdminUserId } from "./roles";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("./roles", () => ({
  requireAdminUserId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    user: {
      findUnique: vi.fn(),
    },
    userRole: {
      count: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    appRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    appAccess: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const adminUserId = "admin-user";
const targetUserId = "target-user";
const appRequestId = "app-request-123";
const ownerUserId = "owner-user";
const supportReference = "SUP-123";

function mockUser(id = targetUserId) {
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
    id,
    entraOid: `${id}-oid`,
    email: `${id}@cedarville.edu`,
    displayName: id,
    githubUsername: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

function mockApp(userId = ownerUserId) {
  vi.mocked(prisma.appRequest.findUnique).mockResolvedValueOnce({
    id: appRequestId,
    userId,
    supportReference,
  } as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>);
}

describe("admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminUserId).mockResolvedValue(adminUserId);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(prisma),
    );
  });

  it("grantAdminRoleAction requires an admin, ensures the target user exists, upserts ADMIN role, records audit, and revalidates admin views", async () => {
    mockUser();

    await grantAdminRoleAction(targetUserId);

    expect(requireAdminUserId).toHaveBeenCalled();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: targetUserId },
    });
    expect(prisma.userRole.upsert).toHaveBeenCalledWith({
      where: {
        userId_role: {
          userId: targetUserId,
          role: "ADMIN",
        },
      },
      update: {},
      create: {
        userId: targetUserId,
        role: "ADMIN",
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("ADMIN_ROLE_GRANTED", {
      actorUserId: adminUserId,
      targetUserId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
  });

  it("grantAdminRoleAction throws when the target user does not exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    await expect(grantAdminRoleAction(targetUserId)).rejects.toThrow(
      "User not found.",
    );

    expect(requireAdminUserId).toHaveBeenCalled();
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("removeAdminRoleAction requires an admin and blocks removing the last admin", async () => {
    vi.mocked(prisma.userRole.count).mockResolvedValueOnce(1);

    await expect(removeAdminRoleAction(targetUserId)).rejects.toThrow(
      "At least one admin must remain.",
    );

    expect(requireAdminUserId).toHaveBeenCalled();
    expect(prisma.userRole.count).toHaveBeenCalledWith({
      where: { role: "ADMIN" },
    });
    expect(prisma.userRole.deleteMany).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("removeAdminRoleAction deletes ADMIN role otherwise, records audit, and revalidates admin views", async () => {
    vi.mocked(prisma.userRole.count).mockResolvedValueOnce(2);

    await removeAdminRoleAction(targetUserId);

    expect(requireAdminUserId).toHaveBeenCalled();
    expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: targetUserId,
        role: "ADMIN",
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("ADMIN_ROLE_REMOVED", {
      actorUserId: adminUserId,
      targetUserId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
  });

  it("addAppCollaboratorAction requires an admin, ensures user and app exist, upserts collaborator idempotently, records audit, and revalidates app views", async () => {
    mockUser();
    mockApp();

    await addAppCollaboratorAction(appRequestId, targetUserId);

    expect(requireAdminUserId).toHaveBeenCalled();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: targetUserId },
    });
    expect(prisma.appRequest.findUnique).toHaveBeenCalledWith({
      where: { id: appRequestId },
    });
    expect(prisma.appAccess.upsert).toHaveBeenCalledWith({
      where: {
        appRequestId_userId: {
          appRequestId,
          userId: targetUserId,
        },
      },
      update: {},
      create: {
        appRequestId,
        userId: targetUserId,
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("APP_COLLABORATOR_ADDED", {
      actorUserId: adminUserId,
      appRequestId,
      supportReference,
      targetUserId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith(`/download/${appRequestId}`);
  });

  it("addAppCollaboratorAction does not add AppAccess when the target is the owner", async () => {
    mockUser(ownerUserId);
    mockApp(ownerUserId);

    await addAppCollaboratorAction(appRequestId, ownerUserId);

    expect(prisma.appAccess.upsert).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith("APP_COLLABORATOR_ADDED", {
      actorUserId: adminUserId,
      appRequestId,
      supportReference,
      targetUserId: ownerUserId,
    });
  });

  it("addAppCollaboratorAction throws when the app does not exist", async () => {
    mockUser();
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValueOnce(null);

    await expect(
      addAppCollaboratorAction(appRequestId, targetUserId),
    ).rejects.toThrow("App request not found.");

    expect(prisma.appAccess.upsert).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("removeAppCollaboratorAction requires an admin, deletes AppAccess if present, records audit, and revalidates app views", async () => {
    mockApp();

    await removeAppCollaboratorAction(appRequestId, targetUserId);

    expect(requireAdminUserId).toHaveBeenCalled();
    expect(prisma.appRequest.findUnique).toHaveBeenCalledWith({
      where: { id: appRequestId },
    });
    expect(prisma.appAccess.deleteMany).toHaveBeenCalledWith({
      where: {
        appRequestId,
        userId: targetUserId,
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("APP_COLLABORATOR_REMOVED", {
      actorUserId: adminUserId,
      appRequestId,
      supportReference,
      targetUserId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith(`/download/${appRequestId}`);
  });

  it("reassignAppOwnerAction requires an admin, ensures the new owner and app exist, transfers ownership, adjusts collaborator rows, records audit, and revalidates app views", async () => {
    const newOwnerUserId = "new-owner-user";
    mockUser(newOwnerUserId);
    mockApp(ownerUserId);

    await reassignAppOwnerAction(appRequestId, newOwnerUserId);

    expect(requireAdminUserId).toHaveBeenCalled();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: newOwnerUserId },
    });
    expect(prisma.appRequest.findUnique).toHaveBeenCalledWith({
      where: { id: appRequestId },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: appRequestId },
      data: { userId: newOwnerUserId },
    });
    expect(prisma.appAccess.upsert).toHaveBeenCalledWith({
      where: {
        appRequestId_userId: {
          appRequestId,
          userId: ownerUserId,
        },
      },
      update: {},
      create: {
        appRequestId,
        userId: ownerUserId,
      },
    });
    expect(prisma.appAccess.deleteMany).toHaveBeenCalledWith({
      where: {
        appRequestId,
        userId: newOwnerUserId,
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("APP_OWNER_REASSIGNED", {
      actorUserId: adminUserId,
      appRequestId,
      supportReference,
      oldOwnerUserId: ownerUserId,
      newOwnerUserId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith(`/download/${appRequestId}`);
  });
});
