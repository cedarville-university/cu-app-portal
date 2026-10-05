import { randomUUID } from "node:crypto";
import { Prisma, type PublishAttempt } from "@prisma/client";
import { prisma } from "@/lib/db";

export const PUBLISH_LEASE_MS = 120_000;
export const LEGACY_PUBLISH_STALE_MS = 30 * 60_000;
export type PublishWorkerClaim = { attemptId: string; token: string };
export class PublishClaimLostError extends Error {
  constructor() { super("The publishing worker no longer owns this attempt."); }
}

export function isPublishAttemptStale(attempt: Pick<PublishAttempt, "status" | "workerLeaseExpiresAt" | "startedAt" | "createdAt" | "workerHeartbeatAt">, now = new Date()) {
  if (!["QUEUED", "RUNNING"].includes(attempt.status)) return false;
  if (attempt.workerLeaseExpiresAt) return attempt.workerLeaseExpiresAt <= now;
  return (attempt.workerHeartbeatAt ?? attempt.startedAt ?? attempt.createdAt).getTime() <= now.getTime() - (attempt.status === "QUEUED" ? 5 * 60_000 : LEGACY_PUBLISH_STALE_MS);
}

export async function claimPublishAttempt(attempt: PublishAttempt, allowQueued = false): Promise<PublishWorkerClaim | null> {
  const now = new Date();
  if (attempt.workerLeaseExpiresAt && attempt.workerLeaseExpiresAt > now) return null;
  if (!allowQueued && !isPublishAttemptStale(attempt, now)) return null;
  if (allowQueued && attempt.status !== "QUEUED" && !isPublishAttemptStale(attempt, now)) return null;
  const token = randomUUID();
  const claimed = await prisma.publishAttempt.updateMany({
    where: {
      id: attempt.id, status: attempt.status, workerToken: attempt.workerToken,
      workerLeaseExpiresAt: attempt.workerLeaseExpiresAt,
      workerHeartbeatAt: attempt.workerHeartbeatAt,
    },
    data: { workerToken: token, workerLeaseExpiresAt: new Date(now.getTime() + PUBLISH_LEASE_MS), workerHeartbeatAt: now },
  });
  return claimed.count === 1 ? { attemptId: attempt.id, token } : null;
}

export async function renewPublishClaim(claim: PublishWorkerClaim) {
  const now = new Date();
  const renewed = await prisma.publishAttempt.updateMany({
    where: { id: claim.attemptId, workerToken: claim.token, status: { in: ["QUEUED", "RUNNING"] }, workerLeaseExpiresAt: { gt: now } },
    data: { workerHeartbeatAt: now, workerLeaseExpiresAt: new Date(now.getTime() + PUBLISH_LEASE_MS) },
  });
  if (renewed.count !== 1) throw new PublishClaimLostError();
}

export async function assertPublishClaim(claim: PublishWorkerClaim) {
  const attempt = await prisma.publishAttempt.findFirst({
    where: { id: claim.attemptId, workerToken: claim.token, workerLeaseExpiresAt: { gt: new Date() }, status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true },
  });
  if (!attempt) throw new PublishClaimLostError();
}

export async function persistPublishProgress(
  claim: PublishWorkerClaim,
  appRequestId: string,
  attemptData: Prisma.PublishAttemptUpdateManyMutationInput,
  appData?: Prisma.AppRequestUpdateManyMutationInput,
) {
  await prisma.$transaction(async (tx) => {
    const latest = await tx.publishAttempt.findFirst({ where: { appRequestId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    if (latest?.id !== claim.attemptId) throw new PublishClaimLostError();
    const updated = await tx.publishAttempt.updateMany({
      where: { id: claim.attemptId, workerToken: claim.token, workerLeaseExpiresAt: { gt: new Date() }, status: { in: ["QUEUED", "RUNNING"] } },
      data: attemptData,
    });
    if (updated.count !== 1) throw new PublishClaimLostError();
    if (appData) {
      const app = await tx.appRequest.updateMany({
        where: { id: appRequestId, publishStatus: { in: ["QUEUED", "PROVISIONING", "DEPLOYING", "FAILED"] } },
        data: appData,
      });
      if (app.count !== 1) throw new PublishClaimLostError();
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function releasePublishClaim(claim: PublishWorkerClaim) {
  await prisma.publishAttempt.updateMany({ where: { id: claim.attemptId, workerToken: claim.token }, data: { workerToken: null, workerLeaseExpiresAt: new Date(), workerHeartbeatAt: new Date() } });
}
