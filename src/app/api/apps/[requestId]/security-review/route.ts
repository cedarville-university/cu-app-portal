import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { DependencyRefreshTimedOut, refreshDependencyReview } from "@/features/security-review/dependency-cache";
import { enrolledRepository } from "@/features/security-review/update-service";
import { prisma } from "@/lib/db";

const headers = { "Cache-Control": "private, no-store" };

type RouteContext = { params: Promise<{ requestId: string }> };

async function dependencyReview({ params }: RouteContext, force: boolean) {
  const userId = await getCurrentUserIdOrNull();
  if (!userId) return new Response(null, { status: 401, headers });

  const { requestId } = await params;
  const isAdmin = await userHasAdminRole(userId);
  const app = await prisma.appRequest.findFirst({
    where: {
      ...appAccessWhere(requestId, userId, isAdmin),
      ...(isAdmin ? {} : { publishStatus: { in: ["SUCCEEDED", "FAILED"] } }),
    },
    select: { repositoryOwner: true, repositoryName: true, repositoryUrl: true, repositoryStatus: true },
  });
  const repository = app && enrolledRepository(app);
  if (!app?.repositoryUrl || !repository) return new Response(null, { status: 404, headers });

  try {
    const dependency = await refreshDependencyReview(requestId, app.repositoryUrl, repository, force);
    return Response.json({ repository: app.repositoryUrl, dependency }, { headers });
  } catch (error) {
    return new Response(null, { status: error instanceof DependencyRefreshTimedOut ? 504 : 502, headers });
  }
}

export async function GET(_request: Request, context: RouteContext) {
  return dependencyReview(context, false);
}

export async function POST(_request: Request, context: RouteContext) {
  return dependencyReview(context, true);
}
