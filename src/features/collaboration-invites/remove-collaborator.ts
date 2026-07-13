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

  const deleted = await prisma.appAccess.deleteMany({
    where: {
      appRequestId,
      userId: targetUserId,
    },
  });
  const removed = deleted.count > 0;

  let github: RemoveAppCollaboratorResult["github"] = "skipped";
  let githubError: string | undefined;

  const canAttemptGitHub =
    appRequest.repositoryStatus === "READY" &&
    Boolean(appRequest.repositoryOwner) &&
    Boolean(appRequest.repositoryName);

  if (canAttemptGitHub) {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { githubUsername: true },
    });
    const githubUsername = targetUser?.githubUsername?.trim() ?? "";

    if (githubUsername) {
      try {
        await revokeManagedRepositoryAccess({
          owner: appRequest.repositoryOwner!,
          repositoryName: appRequest.repositoryName!,
          githubUsername,
        });
        github = "revoked";
      } catch (error) {
        github = "failed";
        githubError = error instanceof Error ? error.message : "unknown";
        console.error("Managed repository collaborator revoke failed", {
          appRequestId,
          targetUserId,
          githubUsername,
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
