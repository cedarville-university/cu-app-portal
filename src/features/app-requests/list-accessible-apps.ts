import { appListWhereForUser } from "@/features/app-requests/access";
import { summarizePortalApp, type PortalAppSummary } from "@/features/app-requests/portal-summary";
import type { PortalActor } from "@/features/portal-api/principal";
import { resolveRepositoryAccessForActor } from "@/features/repositories/actor-access";
import { prisma } from "@/lib/db";

export async function listAccessibleAppSummaries(
  actor: PortalActor,
): Promise<PortalAppSummary[]> {
  const [apps, actorUser] = await Promise.all([
    prisma.appRequest.findMany({
      where: actor.isAdmin ? {} : appListWhereForUser(actor.userId),
      orderBy: { createdAt: "desc" },
      include: {
        template: { select: { slug: true, name: true } },
        repositoryImport: { select: { preparationStatus: true } },
        publishAttempts: {
          orderBy: { createdAt: "desc" },
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
      },
    }),
    prisma.user.findUnique({
      where: { id: actor.userId },
      select: { githubUsername: true },
    }),
  ]);

  return Promise.all(
    apps.map(async (app) =>
      summarizePortalApp(
        app,
        await resolveRepositoryAccessForActor({
          requestId: app.id,
          actorUserId: actor.userId,
          githubUsername: actorUser?.githubUsername ?? null,
          legacyStatus: app.repositoryAccessStatus,
          legacyNote: app.repositoryAccessNote,
        }),
      ),
    ),
  );
}
