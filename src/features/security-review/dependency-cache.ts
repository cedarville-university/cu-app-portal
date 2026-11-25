import { prisma } from "@/lib/db";
import { isFreshDependencyReview, reviewResults, type DependencyReview } from "./results";
import { readDependencyReview } from "./update-service";

type Repository = { owner: string; name: string };
const refreshing = new Map<string, Promise<DependencyReview>>();

function dependencyReviewKey(appRequestId: string, repository: string) {
  return { appRequestId, repository: repository.toLowerCase() };
}

export async function getCachedDependencyReview(appRequestId: string, repository: string) {
  const saved = await prisma.appDependencyReview.findUnique({
    where: { appRequestId_repository: dependencyReviewKey(appRequestId, repository) },
    select: { dependency: true },
  });
  const parsed = reviewResults.shape.dependency.unwrap().safeParse(saved?.dependency);
  return parsed.success ? parsed.data : null;
}

export async function getDependencyReviewTime(appRequestId: string, repository: string) {
  const saved = await prisma.appDependencyReview.findUnique({
    where: { appRequestId_repository: dependencyReviewKey(appRequestId, repository) },
    select: { checkedAt: true },
  });
  return saved?.checkedAt.toISOString() ?? null;
}

export class DependencyRefreshTimedOut extends Error {}

export async function refreshDependencyReview(
  appRequestId: string,
  repositoryUrl: string,
  repository: Repository,
  force: boolean,
) {
  if (!force) {
    const saved = await getCachedDependencyReview(appRequestId, repositoryUrl);
    if (saved && isFreshDependencyReview(saved, Date.now())) return saved;
  }

  const identity = dependencyReviewKey(appRequestId, repositoryUrl);
  const key = JSON.stringify(identity);
  const inProgress = refreshing.get(key);
  if (inProgress) return inProgress;

  const refresh = (async () => {
    const deadline = AbortSignal.timeout(10_000);
    const controller = new AbortController();
    try {
      const dependency = await readDependencyReview(repository, AbortSignal.any([deadline, controller.signal]));
      deadline.throwIfAborted();
      const checkedAt = new Date(dependency.checkedAt);
      await prisma.appDependencyReview.upsert({
        where: { appRequestId_repository: identity },
        create: { ...identity, checkedAt, dependency },
        update: { checkedAt, dependency },
      });
      return dependency;
    } catch (error) {
      if (deadline.aborted) throw new DependencyRefreshTimedOut("GitHub review timed out");
      throw error;
    } finally {
      controller.abort();
    }
  })();
  refreshing.set(key, refresh);
  try {
    return await refresh;
  } finally {
    refreshing.delete(key);
  }
}
