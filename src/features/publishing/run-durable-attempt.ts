import { prisma } from "@/lib/db";
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
import { runPublishAttempt } from "./run-publish-attempt";
import { reconcileClaimedPublish } from "./recovery";
import { assertPublishClaim, claimPublishAttempt, releasePublishClaim, renewPublishClaim, PublishClaimLostError } from "./worker-lease";

export async function runDurablePublishAttempt(attemptId: string) {
  const attempt = await prisma.publishAttempt.findUnique({ where: { id: attemptId }, include: { appRequest: true } });
  if (!attempt || !["QUEUED", "RUNNING"].includes(attempt.status)) return;
  const latest = await prisma.publishAttempt.findFirst({ where: { appRequestId: attempt.appRequestId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
  if (latest?.id !== attempt.id || !["QUEUED", "PROVISIONING", "DEPLOYING"].includes(attempt.appRequest.publishStatus)) return;
  const claim = await claimPublishAttempt(attempt, true);
  if (!claim) return;
  let lost = false;
  let renewing = false;
  const heartbeat = setInterval(() => {
    if (renewing) return;
    renewing = true;
    void renewPublishClaim(claim).catch(() => { lost = true; }).finally(() => { renewing = false; });
  }, 20_000);
  try {
    // Never redispatch a workflow after an interrupted deployment. Inspect the
    // recorded run instead; unknown dispatch outcomes require administrator review.
    if (attempt.status === "RUNNING" && (attempt.dispatchStartedAt || attempt.githubWorkflowRunId || attempt.stage !== "PROVISIONING")) {
      await reconcileClaimedPublish(attempt, claim);
      return;
    }
    const authorize = async () => {
      if (lost) throw new PublishClaimLostError();
      await assertPublishClaim(claim);
      if (!attempt.actorUserId) throw new Error("The publishing request has no authorized actor.");
      const isAdmin = await userHasAdminRole(attempt.actorUserId);
      const app = await prisma.appRequest.findFirst({
        where: { AND: [appAccessWhere(attempt.appRequestId, attempt.actorUserId, isAdmin), { repositoryStatus: "READY", publishStatus: { in: ["QUEUED", "PROVISIONING", "DEPLOYING"] } }] },
        include: { repositoryImport: true },
      });
      if (!app || (app.sourceOfTruth === "IMPORTED_REPOSITORY" && app.repositoryImport?.preparationStatus !== "COMMITTED")) {
        throw new Error("App access or publishing readiness has changed.");
      }
    };
    try {
      await runPublishAttempt(attemptId, undefined, authorize, claim);
    } catch (error) {
      // Business failures have already been persisted by the orchestrator.
      // Database/lease failures must redeliver rather than acknowledge success.
      const settled = await prisma.publishAttempt.findUnique({ where: { id: attemptId }, select: { status: true } });
      if (!settled || !["SUCCEEDED", "FAILED"].includes(settled.status)) throw error;
    }
  } finally {
    clearInterval(heartbeat);
    await releasePublishClaim(claim);
  }
}
