import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

const DEAD_LETTER_SUMMARY =
  "Repository import reached the dead-letter queue.";

type ReconcileContext = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  repositoryImportId: string;
  repositoryImport: {
    activeAttemptId: string | null;
    appRequestId: string;
    appRequest: {
      userId: string;
      supportReference: string;
    };
  };
};

export type ReconcileDeadLetterDeps = {
  db: typeof prisma;
  now: () => Date;
  recordAuditEvent: typeof recordAuditEvent;
  notifyAppEvent: typeof safeNotifyAppEvent;
  log: (event: string, details: Record<string, unknown>) => void;
};

export async function reconcileDeadLetteredAttempt(
  attemptId: string,
  dependencies: Partial<ReconcileDeadLetterDeps> = {},
): Promise<"reconciled" | "already-terminal" | "missing"> {
  const deps: ReconcileDeadLetterDeps = {
    db: prisma,
    now: () => new Date(),
    recordAuditEvent,
    notifyAppEvent: safeNotifyAppEvent,
    log: (event, details) =>
      console.info("[repository-import-dead-letter]", event, details),
    ...dependencies,
  };
  const context = (await deps.db.repositoryImportAttempt.findUnique({
    where: { id: attemptId },
    include: {
      repositoryImport: { include: { appRequest: true } },
    },
  })) as ReconcileContext | null;

  if (!context) return "missing";
  if (
    !["PENDING", "RUNNING"].includes(context.status) ||
    context.repositoryImport.activeAttemptId !== attemptId
  ) {
    return "already-terminal";
  }

  const reconciledAt = deps.now();
  const reconciled = await deps.db.$transaction(async (tx) => {
    const attempt = await tx.repositoryImportAttempt.updateMany({
      where: {
        id: attemptId,
        status: { in: ["PENDING", "RUNNING"] },
        repositoryImport: { activeAttemptId: attemptId },
      },
      data: {
        status: "FAILED",
        errorSummary: DEAD_LETTER_SUMMARY,
        finishedAt: reconciledAt,
        leaseExpiresAt: null,
      },
    });
    if (attempt.count !== 1) return false;

    await tx.repositoryImport.updateMany({
      where: {
        id: context.repositoryImportId,
        activeAttemptId: attemptId,
      },
      data: {
        activeAttemptId: null,
        importStatus: "FAILED",
        importErrorSummary: DEAD_LETTER_SUMMARY,
        preparationStatus: "BLOCKED",
        preparationErrorSummary: DEAD_LETTER_SUMMARY,
      },
    });
    await tx.appRequest.updateMany({
      where: { id: context.repositoryImport.appRequestId },
      data: {
        repositoryStatus: "FAILED",
        publishErrorSummary: DEAD_LETTER_SUMMARY,
      },
    });
    return true;
  });

  if (!reconciled) return "already-terminal";

  const identifiers = {
    attemptId,
    repositoryImportId: context.repositoryImportId,
    requestId: context.repositoryImport.appRequestId,
    supportReference: context.repositoryImport.appRequest.supportReference,
    reason: DEAD_LETTER_SUMMARY,
  };
  await deps.recordAuditEvent("EXISTING_APP_IMPORT_FAILED", identifiers);
  await deps.notifyAppEvent({
    appRequestId: context.repositoryImport.appRequestId,
    eventKey: "REPOSITORY_FAILED",
    actorUserId: context.repositoryImport.appRequest.userId,
    directRecipientUserIds: [context.repositoryImport.appRequest.userId],
  });
  deps.log("reconciled", identifiers);
  return "reconciled";
}

async function main() {
  const attemptId = process.argv[2]?.trim();
  if (!attemptId || process.argv.length !== 3) {
    throw new Error(
      "Usage: npm run repository-import:reconcile-dead-letter -- <attempt-id>",
    );
  }
  const result = await reconcileDeadLetteredAttempt(attemptId);
  console.info(JSON.stringify({ attemptId, result }));
}

if (process.argv[1]?.endsWith("scripts/repository-imports/reconcile-dead-letter.ts")) {
  void main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Dead-letter reconciliation failed.",
    );
    process.exitCode = 1;
  });
}
