import { appAccessWhere, appListWhereForUser } from "@/features/app-requests/access";
import {
  summarizePortalApp,
  summarizePortalPublishAttempt,
  type PortalAppSummary,
  type PortalPublishAttemptSummary,
} from "@/features/app-requests/portal-summary";
import { PortalApiError } from "@/features/portal-api/errors";
import type { PortalActor } from "@/features/portal-api/principal";
import { resolveRepositoryAccessForActor } from "@/features/repositories/actor-access";
import { prisma } from "@/lib/db";

const appSummaryInclude = {
  template: { select: { slug: true, name: true } },
  repositoryImport: { select: { preparationStatus: true } },
  publishAttempts: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      id: true,
      status: true,
      stage: true,
      githubWorkflowRunUrl: true,
      startedAt: true,
      finishedAt: true,
    },
  },
};

async function actorGithubUsername(actor: PortalActor) {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { githubUsername: true },
  });

  return user?.githubUsername ?? null;
}

async function repositoryAccessForActor(
  actor: PortalActor,
  app: {
    id: string;
    repositoryAccessStatus: "NOT_REQUESTED" | "INVITED" | "GRANTED" | "FAILED";
    repositoryAccessNote: string | null;
  },
) {
  return resolveRepositoryAccessForActor({
    requestId: app.id,
    actorUserId: actor.userId,
    githubUsername: await actorGithubUsername(actor),
    legacyStatus: app.repositoryAccessStatus,
    legacyNote: app.repositoryAccessNote,
  });
}

export async function getAccessibleAppSummary(
  actor: PortalActor,
  requestId: string,
): Promise<PortalAppSummary> {
  const app = await prisma.appRequest.findFirst({
    where: appAccessWhere(requestId, actor.userId, actor.isAdmin),
    include: appSummaryInclude,
  });

  if (!app) {
    throw new PortalApiError("NOT_FOUND", "App not found.");
  }

  return summarizePortalApp(app, await repositoryAccessForActor(actor, app));
}

export async function getAccessiblePublishAttemptSummary(
  actor: PortalActor,
  attemptId: string,
): Promise<PortalPublishAttemptSummary> {
  const attempt = await prisma.publishAttempt.findFirst({
    where: {
      id: attemptId,
      appRequest: {
        is: actor.isAdmin ? {} : appListWhereForUser(actor.userId),
      },
    },
    select: {
      id: true,
      status: true,
      stage: true,
      githubWorkflowRunUrl: true,
      startedAt: true,
      finishedAt: true,
      appRequest: { select: { id: true } },
    },
  });

  if (!attempt) {
    throw new PortalApiError("NOT_FOUND", "App not found.");
  }

  return summarizePortalPublishAttempt(attempt, attempt.appRequest.id);
}
