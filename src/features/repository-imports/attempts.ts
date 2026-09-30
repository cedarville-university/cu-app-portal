import {
  type Prisma,
  type RepositoryImportAttemptStage,
} from "@prisma/client";
import { prisma } from "@/lib/db";

const DEFAULT_LEASE_DURATION_MS = 35 * 60 * 1000;

export type ImportAttemptLease = {
  attemptId: string;
  repositoryImportId: string;
  appRequestId: string;
  workerExecutionName: string;
  leaseExpiresAt: Date;
};

export async function createImportAttempt(
  tx: Prisma.TransactionClient,
  input: { repositoryImportId: string; now: Date },
): Promise<{ attemptId: string }> {
  const attempt = await tx.repositoryImportAttempt.create({
    data: {
      repositoryImportId: input.repositoryImportId,
      status: "PENDING",
      stage: "ENQUEUE",
      queuedAt: input.now,
    },
    select: { id: true },
  });

  const activated = await tx.repositoryImport.updateMany({
    where: { id: input.repositoryImportId, activeAttemptId: null },
    data: { activeAttemptId: attempt.id },
  });

  if (activated.count !== 1) {
    throw new Error("Repository import already has an active attempt.");
  }

  return { attemptId: attempt.id };
}

export async function claimImportAttempt(input: {
  attemptId: string;
  workerExecutionName: string;
  deliveryCount: number;
  now: Date;
  leaseDurationMs?: number;
}): Promise<ImportAttemptLease | null> {
  const leaseExpiresAt = new Date(
    input.now.getTime() +
      (input.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS),
  );
  const claimed = await prisma.repositoryImportAttempt.updateMany({
    where: {
      id: input.attemptId,
      repositoryImport: { activeAttemptId: input.attemptId },
      OR: [
        { status: "PENDING" },
        {
          status: "RUNNING",
          leaseExpiresAt: { lte: input.now },
        },
      ],
    },
    data: {
      status: "RUNNING",
      stage: "CLAIM",
      workerExecutionName: input.workerExecutionName,
      leaseExpiresAt,
      lastHeartbeatAt: input.now,
      lastDeliveryCount: input.deliveryCount,
      startedAt: input.now,
      errorSummary: null,
    },
  });

  if (claimed.count !== 1) {
    return null;
  }

  const attempt = await prisma.repositoryImportAttempt.findUnique({
    where: { id: input.attemptId },
    select: {
      id: true,
      repositoryImportId: true,
      workerExecutionName: true,
      leaseExpiresAt: true,
      repositoryImport: { select: { appRequestId: true } },
    },
  });

  if (
    !attempt?.workerExecutionName ||
    !attempt.leaseExpiresAt ||
    attempt.workerExecutionName !== input.workerExecutionName
  ) {
    return null;
  }

  return {
    attemptId: attempt.id,
    repositoryImportId: attempt.repositoryImportId,
    appRequestId: attempt.repositoryImport.appRequestId,
    workerExecutionName: attempt.workerExecutionName,
    leaseExpiresAt: attempt.leaseExpiresAt,
  };
}

export async function renewImportAttemptLease(
  lease: ImportAttemptLease,
  now: Date,
): Promise<ImportAttemptLease | null> {
  const leaseExpiresAt = new Date(now.getTime() + DEFAULT_LEASE_DURATION_MS);
  const renewed = await prisma.repositoryImportAttempt.updateMany({
    where: activeLeaseWhere(lease, now),
    data: { leaseExpiresAt, lastHeartbeatAt: now },
  });

  return renewed.count === 1 ? { ...lease, leaseExpiresAt } : null;
}

export async function completeImportAttempt(
  lease: ImportAttemptLease,
  input: { now: Date },
): Promise<boolean> {
  return settleImportAttempt(lease, input.now, {
    status: "SUCCEEDED",
    stage: "COMPLETE",
    errorSummary: null,
    finishedAt: input.now,
    leaseExpiresAt: null,
  });
}

export async function failImportAttempt(
  lease: ImportAttemptLease,
  input: {
    stage: RepositoryImportAttemptStage;
    errorSummary: string;
    now: Date;
  },
): Promise<boolean> {
  return settleImportAttempt(lease, input.now, {
    status: "FAILED",
    stage: input.stage,
    errorSummary: input.errorSummary,
    finishedAt: input.now,
    leaseExpiresAt: null,
  });
}

function activeLeaseWhere(lease: ImportAttemptLease, now: Date) {
  return {
    id: lease.attemptId,
    status: "RUNNING" as const,
    workerExecutionName: lease.workerExecutionName,
    leaseExpiresAt: { gt: now },
  };
}

async function settleImportAttempt(
  lease: ImportAttemptLease,
  now: Date,
  data: Prisma.RepositoryImportAttemptUpdateManyMutationInput,
) {
  return prisma.$transaction(async (tx) => {
    const settled = await tx.repositoryImportAttempt.updateMany({
      where: activeLeaseWhere(lease, now),
      data,
    });

    if (settled.count !== 1) {
      return false;
    }

    await tx.repositoryImport.updateMany({
      where: {
        id: lease.repositoryImportId,
        activeAttemptId: lease.attemptId,
      },
      data: { activeAttemptId: null },
    });

    return true;
  });
}
