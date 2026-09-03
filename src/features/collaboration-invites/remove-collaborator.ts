import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { revokeManagedRepositoryAccess } from "@/features/repositories/access";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

export type RemoveAppCollaboratorResult = {
  removed: boolean;
  github: "revoked" | "skipped" | "failed";
  githubError?: string;
};

export async function removeAppCollaborator({
  appRequestId,
  targetUserId,
  actorUserId,
}: {
  appRequestId: string;
  targetUserId: string;
  actorUserId: string;
}): Promise<RemoveAppCollaboratorResult> {
  const appRequest = await prisma.appRequest.findUnique({
    where: { id: appRequestId },
    select: {
      id: true,
      userId: true,
      supportReference: true,
      repositoryStatus: true,
      repositoryOwner: true,
      repositoryName: true,
    },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  if (appRequest.userId === targetUserId) {
    throw new Error("Cannot remove the app owner as a collaborator.");
  }

  const canAttemptGitHub =
    appRequest.repositoryStatus === "READY" &&
    Boolean(appRequest.repositoryOwner) &&
    Boolean(appRequest.repositoryName);
  const deleted = await prisma.appAccess.deleteMany({
    where: {
      appRequestId,
      userId: targetUserId,
    },
  });
  const removed = deleted.count > 0;

  const recordedGrants = canAttemptGitHub
    ? await prisma.repositoryAccessGrant.findMany({
        where: {
          appRequestId,
          actorUserId: targetUserId,
          revokedAt: null,
        },
        select: { id: true, githubUsername: true },
      })
    : [];

  let github: RemoveAppCollaboratorResult["github"] = "skipped";
  let githubError: string | undefined;

  if (canAttemptGitHub) {
    let grants: Array<{ id: string | null; githubUsername: string }> =
      recordedGrants;
    if (grants.length === 0) {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { githubUsername: true },
      });
      const legacyUsername = targetUser?.githubUsername?.trim().toLowerCase() ?? "";
      grants = legacyUsername
        ? [{ id: null, githubUsername: legacyUsername }]
        : [];
    }

    for (const grant of grants) {
      try {
        await revokeManagedRepositoryAccess({
          owner: appRequest.repositoryOwner!,
          repositoryName: appRequest.repositoryName!,
          githubUsername: grant.githubUsername,
        });
        if (grant.id) {
          await prisma.repositoryAccessGrant.update({
            where: { id: grant.id },
            data: { revokedAt: new Date() },
          });
        }
        if (github !== "failed") {
          github = "revoked";
        }
      } catch (error) {
        github = "failed";
        githubError ??= error instanceof Error ? error.message : "unknown";
        console.error("Managed repository collaborator revoke failed", {
          appRequestId,
          targetUserId,
          githubUsername: grant.githubUsername,
          error,
        });
      }
    }
  }

  if (removed) {
    await recordAuditEvent("APP_COLLABORATOR_REMOVED", {
      actorUserId,
      appRequestId,
      supportReference: appRequest.supportReference,
      targetUserId,
      github,
      ...(githubError ? { githubError } : {}),
    });
    await safeNotifyAppEvent({
      appRequestId,
      eventKey: "COLLABORATOR_REMOVED",
      actorUserId,
      directRecipientUserIds: [targetUserId],
    });
  }

  return githubError
    ? { removed, github, githubError }
    : { removed, github };
}
