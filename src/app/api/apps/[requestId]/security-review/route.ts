import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { enrolledRepository, readDependencyReview } from "@/features/security-review/update-service";
import { prisma } from "@/lib/db";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
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
  if (!app || !repository) return new Response(null, { status: 404, headers });

  const deadline = AbortSignal.timeout(10_000);
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, deadline, controller.signal]);
  try {
    const dependency = await readDependencyReview(repository, signal);
    return Response.json({ repository: app.repositoryUrl, dependency }, { headers });
  } catch {
    return new Response(null, { status: deadline.aborted ? 504 : 502, headers });
  } finally {
    controller.abort();
  }
}
