import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { cache } from "react";
import { appAccessWhere } from "@/features/app-requests/access";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { getRenderAdminRole } from "@/features/app-requests/render-access";
import { getCachedDependencyReview, getDependencyReviewTime } from "@/features/security-review/dependency-cache";
import { ownerSecurityReview } from "@/features/security-review/owner-results";
import { enrolledRepository } from "@/features/security-review/update-service";
import { prisma } from "@/lib/db";

export const getAppDetailsHeader = cache(async (requestId: string) => {
  const userId = await getCurrentUserIdOrNull();
  if (!userId) return null;
  const isAdmin = await getRenderAdminRole(userId);
  const where = appAccessWhere(requestId, userId, isAdmin);
  const app = await prisma.appRequest.findFirst({
    where,
    select: { id: true, userId: true, appName: true, publishStatus: true, primaryPublishUrl: true, publishUrl: true },
  });
  return app ? { app, where, userId, isAdmin } : null;
});

export async function getAppDetailsFields<T extends Prisma.AppRequestSelect>(where: Prisma.AppRequestWhereInput, select: T) {
  const fields = await prisma.appRequest.findFirst({ where, select });
  if (!fields) notFound();
  return fields;
}

export const securityReviewFields = {
  id: true,
  repositoryUrl: true,
  repositoryStatus: true,
  repositoryOwner: true,
  repositoryName: true,
  securityReview: { select: { checkedAt: true, repositoryUrl: true, results: true } },
} satisfies Prisma.AppRequestSelect;

export async function getAppSecurityData(
  app: Prisma.AppRequestGetPayload<{ select: typeof securityReviewFields }>,
  section: "overview" | "security",
) {
  const repository = app.repositoryUrl;
  const canRefresh = Boolean(repository && enrolledRepository(app));
  const [nightly, dependency, cachedTime] = await Promise.all([
    repository && app.repositoryStatus === "READY"
      ? prisma.nightlyRepositoryScan.findUnique({
        where: { repository: repository.toLowerCase() },
        select: { successfulSha: true, source: true },
      })
      : null,
    repository && canRefresh && section === "security" ? getCachedDependencyReview(app.id, repository) : null,
    repository && canRefresh && section === "overview" ? getDependencyReviewTime(app.id, repository) : null,
  ]);
  return {
    canRefresh,
    dependency,
    githubCheckedAt: dependency?.checkedAt ?? cachedTime,
    savedReview: ownerSecurityReview(repository, app.securityReview, nightly),
  };
}
