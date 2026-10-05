import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { verifyPublishedUrl } from "./azure/verify-deployment";
import { createPublishQueue } from "./queue";
import {
  claimPublishAttempt, persistPublishProgress, releasePublishClaim,
  type PublishWorkerClaim,
} from "./worker-lease";

export type RecoveryAttempt = Prisma.PublishAttemptGetPayload<{ include: { appRequest: true } }>;
export type RecoveryResult = "succeeded" | "failed" | "requeued" | "waiting" | "review" | "busy" | "settled";
export type RecoveryOptions = { actorUserId?: string; markFailed?: boolean; reason?: string };
export type RecoveryEvidence = {
  workflow(attempt: RecoveryAttempt): Promise<{ status: string; conclusion: string | null }>;
  health(url: string): Promise<{ verifiedAt: Date }>;
};

export const defaultRecoveryEvidence: RecoveryEvidence = {
  async workflow(attempt) {
    const app = attempt.appRequest;
    if (!app.repositoryOwner || !app.repositoryName || !attempt.githubWorkflowRunId) throw new Error("The publish attempt has no recorded GitHub deployment run.");
    const config = loadGitHubAppConfig();
    const installationId = config.installationIdsByOrg[app.repositoryOwner];
    if (!installationId) throw new Error("GitHub installation is not configured for the app repository.");
    const github = createGitHubAppClient({
      appId: config.appId, privateKey: config.privateKey, installationId,
      fetchImpl: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
    });
    return github.getWorkflowRun({ owner: app.repositoryOwner, name: app.repositoryName, runId: attempt.githubWorkflowRunId });
  },
  health: verifyPublishedUrl,
};

export async function reconcileClaimedPublish(
  attempt: RecoveryAttempt,
  claim: PublishWorkerClaim,
  options: RecoveryOptions = {},
  evidence: RecoveryEvidence = defaultRecoveryEvidence,
): Promise<RecoveryResult> {
  const app = attempt.appRequest;
  if (!attempt.githubWorkflowRunId) {
    if (!options.markFailed) return "review";
  } else {
    const run = await evidence.workflow(attempt);
    if (run.status !== "completed") return "waiting";
    if (run.conclusion === "success") {
      const url = app.primaryPublishUrl ?? app.publishUrl;
      if (!url) return "review";
      let verification: { verifiedAt: Date } | undefined;
      try {
        verification = await evidence.health(url);
      } catch {
        if (!options.markFailed && Date.now() - (attempt.startedAt ?? attempt.createdAt).getTime() < 2 * 60 * 60_000) return "waiting";
      }
      if (verification) {
        const { verifiedAt } = verification;
        await persistPublishProgress(claim, app.id,
          { status: "SUCCEEDED", stage: "COMPLETED", errorSummary: null, verifiedAt, finishedAt: verifiedAt },
          { publishStatus: "SUCCEEDED", publishUrl: url, publishErrorSummary: null, publishingSetupStatus: "READY", publishingSetupErrorSummary: null, lastPublishedAt: verifiedAt },
        );
        await recordAuditEvent("PUBLISH_RECOVERED", {
          appRequestId: app.id, publishAttemptId: attempt.id, actorUserId: options.actorUserId,
          supportReference: app.supportReference, outcome: "SUCCEEDED", workflowRunId: attempt.githubWorkflowRunId, verifiedAt: verifiedAt.toISOString(), reason: options.reason,
        });
        return "succeeded";
      }
    }
  }
  const reason = options.reason ?? "The interrupted deployment could not be verified as successful. Review the deployment log before retrying.";
  await persistPublishProgress(claim, app.id,
    { status: "FAILED", stage: "FAILED", errorSummary: reason, finishedAt: new Date() },
    { publishStatus: "FAILED", publishErrorSummary: reason },
  );
  await recordAuditEvent("PUBLISH_RECOVERED", { appRequestId: app.id, publishAttemptId: attempt.id, actorUserId: options.actorUserId, supportReference: app.supportReference, outcome: "FAILED", reason });
  return "failed";
}

async function synchronizeSettledApp(attempt: RecoveryAttempt, options: RecoveryOptions, evidence: RecoveryEvidence): Promise<RecoveryResult> {
  if (Date.now() - (attempt.finishedAt ?? attempt.verifiedAt ?? attempt.createdAt).getTime() < 5 * 60_000) return "busy";
  const app = attempt.appRequest;
  let data: Prisma.AppRequestUpdateManyMutationInput;
  if (attempt.status === "SUCCEEDED") {
    if (!attempt.githubWorkflowRunId) return "review";
    const run = await evidence.workflow(attempt);
    const url = app.primaryPublishUrl ?? app.publishUrl;
    if (run.status !== "completed" || run.conclusion !== "success" || !url) return "review";
    const { verifiedAt } = await evidence.health(url);
    data = { publishStatus: "SUCCEEDED", publishUrl: url, publishingSetupStatus: "READY", publishErrorSummary: null, publishingSetupErrorSummary: null, lastPublishedAt: attempt.finishedAt ?? verifiedAt };
  } else {
    data = { publishStatus: "FAILED", publishErrorSummary: attempt.errorSummary ?? "The interrupted attempt failed. Review the deployment log before retrying." };
  }
  await prisma.$transaction(async (tx) => {
    const latest = await tx.publishAttempt.findFirst({ where: { appRequestId: app.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, status: true } });
    if (latest?.id !== attempt.id || latest.status !== attempt.status) throw new Error("A newer publishing attempt has replaced this record.");
    const updated = await tx.appRequest.updateMany({ where: { id: app.id, publishStatus: app.publishStatus, updatedAt: app.updatedAt }, data });
    if (updated.count !== 1) throw new Error("The app changed while recovering publishing.");
  }, { isolationLevel: "Serializable" });
  await recordAuditEvent("PUBLISH_RECOVERED", { appRequestId: app.id, publishAttemptId: attempt.id, actorUserId: options.actorUserId, outcome: attempt.status, reason: "Synchronized a terminal attempt with its stranded app record." });
  return attempt.status === "SUCCEEDED" ? "succeeded" : "failed";
}

export async function recoverPublishAttempt(attemptId: string, options: RecoveryOptions = {}, evidence: RecoveryEvidence = defaultRecoveryEvidence): Promise<RecoveryResult> {
  const attempt = await prisma.publishAttempt.findUnique({ where: { id: attemptId }, include: { appRequest: true } });
  if (!attempt) return "settled";
  const latest = await prisma.publishAttempt.findFirst({ where: { appRequestId: attempt.appRequestId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
  if (latest?.id !== attempt.id || !["QUEUED", "PROVISIONING", "DEPLOYING"].includes(attempt.appRequest.publishStatus)) return "settled";
  if (["SUCCEEDED", "FAILED"].includes(attempt.status)) return synchronizeSettledApp(attempt, options, evidence);
  const claim = await claimPublishAttempt(attempt);
  if (!claim) return "busy";
  try {
    if (!options.markFailed && (attempt.status === "QUEUED" || (!attempt.dispatchStartedAt && !attempt.githubWorkflowRunId && attempt.stage === "PROVISIONING"))) {
      await releasePublishClaim(claim);
      await createPublishQueue().send({ attemptId });
      return "requeued";
    }
    return await reconcileClaimedPublish(attempt, claim, options, evidence);
  } finally {
    await releasePublishClaim(claim);
  }
}

export async function recoverStalePublishes() {
  const now = new Date();
  const attempts = await prisma.publishAttempt.findMany({
    where: { OR: [
      { status: { in: ["QUEUED", "RUNNING"] }, workerLeaseExpiresAt: { lte: now } },
      { status: "QUEUED", workerLeaseExpiresAt: null, createdAt: { lte: new Date(now.getTime() - 5 * 60_000) } },
      { status: "RUNNING", workerLeaseExpiresAt: null, createdAt: { lte: new Date(now.getTime() - 30 * 60_000) } },
      { status: { in: ["SUCCEEDED", "FAILED"] }, appRequest: { publishStatus: { in: ["QUEUED", "PROVISIONING", "DEPLOYING"] } }, finishedAt: { lte: new Date(now.getTime() - 5 * 60_000) } },
    ] },
    orderBy: [{ workerHeartbeatAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }], take: 50,
  });
  const results: Record<string, number> = {};
  for (const attempt of attempts) {
    try {
      const result = await recoverPublishAttempt(attempt.id);
      results[result] = (results[result] ?? 0) + 1;
      // Rotate terminal mismatches and superseded records through the scan so
      // unresolved old records cannot starve more recent interrupted publishes.
      if (["SUCCEEDED", "FAILED"].includes(attempt.status) || result === "settled") {
        await prisma.publishAttempt.updateMany({
          where: { id: attempt.id, status: attempt.status, workerHeartbeatAt: attempt.workerHeartbeatAt },
          data: { workerHeartbeatAt: new Date() },
        });
      }
    } catch {
      results.errors = (results.errors ?? 0) + 1;
      console.error("Publish recovery could not inspect an attempt.", { publishAttemptId: attempt.id });
    }
  }
  return results;
}
