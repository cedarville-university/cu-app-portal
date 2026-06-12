"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requireAdminUserId } from "./roles";

async function ensureUserExists(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  return user;
}

async function ensureAppExists(appRequestId: string) {
  const appRequest = await prisma.appRequest.findUnique({
    where: { id: appRequestId },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return appRequest;
}

function revalidateAdminViews(appRequestId?: string) {
  revalidatePath("/admin");
  revalidatePath("/apps");

  if (appRequestId) {
    revalidatePath(`/download/${appRequestId}`);
  }
}

export async function grantAdminRoleAction(userId: string) {
  const actorUserId = await requireAdminUserId();

  await ensureUserExists(userId);
  await prisma.userRole.upsert({
    where: {
      userId_role: {
        userId,
        role: "ADMIN",
      },
    },
    update: {},
    create: {
      userId,
      role: "ADMIN",
    },
  });
  await recordAuditEvent("ADMIN_ROLE_GRANTED", {
    actorUserId,
    targetUserId: userId,
  });
  revalidateAdminViews();
}

export async function removeAdminRoleAction(userId: string) {
  const actorUserId = await requireAdminUserId();
  const roleRemoved = await prisma.$transaction(
    async (tx) => {
      const targetRole = await tx.userRole.findUnique({
        where: {
          userId_role: {
            userId,
            role: "ADMIN",
          },
        },
      });

      if (!targetRole) {
        return false;
      }

      const adminCount = await tx.userRole.count({
        where: { role: "ADMIN" },
      });

      if (adminCount <= 1) {
        throw new Error("At least one admin must remain.");
      }

      await tx.userRole.delete({
        where: {
          userId_role: {
            userId,
            role: "ADMIN",
          },
        },
      });

      return true;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if (!roleRemoved) {
    revalidateAdminViews();
    return;
  }

  await recordAuditEvent("ADMIN_ROLE_REMOVED", {
    actorUserId,
    targetUserId: userId,
  });
  revalidateAdminViews();
}

export async function addAppCollaboratorAction(
  appRequestId: string,
  userId: string,
) {
  const actorUserId = await requireAdminUserId();

  await ensureUserExists(userId);
  const appRequest = await ensureAppExists(appRequestId);

  if (appRequest.userId !== userId) {
    await prisma.appAccess.upsert({
      where: {
        appRequestId_userId: {
          appRequestId,
          userId,
        },
      },
      update: {},
      create: {
        appRequestId,
        userId,
      },
    });
  }

  await recordAuditEvent("APP_COLLABORATOR_ADDED", {
    actorUserId,
    appRequestId,
    supportReference: appRequest.supportReference,
    targetUserId: userId,
  });
  revalidateAdminViews(appRequestId);
}

export async function removeAppCollaboratorAction(
  appRequestId: string,
  userId: string,
) {
  const actorUserId = await requireAdminUserId();
  const appRequest = await ensureAppExists(appRequestId);

  await prisma.appAccess.deleteMany({
    where: {
      appRequestId,
      userId,
    },
  });
  await recordAuditEvent("APP_COLLABORATOR_REMOVED", {
    actorUserId,
    appRequestId,
    supportReference: appRequest.supportReference,
    targetUserId: userId,
  });
  revalidateAdminViews(appRequestId);
}

export async function reassignAppOwnerAction(
  appRequestId: string,
  newOwnerUserId: string,
) {
  const actorUserId = await requireAdminUserId();

  await ensureUserExists(newOwnerUserId);
  const appRequest = await ensureAppExists(appRequestId);
  const oldOwnerUserId = appRequest.userId;

  await prisma.$transaction(async (tx) => {
    await tx.appRequest.update({
      where: { id: appRequestId },
      data: { userId: newOwnerUserId },
    });

    if (oldOwnerUserId !== newOwnerUserId) {
      await tx.appAccess.upsert({
        where: {
          appRequestId_userId: {
            appRequestId,
            userId: oldOwnerUserId,
          },
        },
        update: {},
        create: {
          appRequestId,
          userId: oldOwnerUserId,
        },
      });
    }

    await tx.appAccess.deleteMany({
      where: {
        appRequestId,
        userId: newOwnerUserId,
      },
    });
  });

  await recordAuditEvent("APP_OWNER_REASSIGNED", {
    actorUserId,
    appRequestId,
    supportReference: appRequest.supportReference,
    oldOwnerUserId,
    newOwnerUserId,
  });
  revalidateAdminViews(appRequestId);
}
