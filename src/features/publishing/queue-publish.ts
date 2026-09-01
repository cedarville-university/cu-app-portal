import type {
  Prisma,
  PublishStatus,
  PublishingSetupStatus,
  RepositoryPreparationStatus,
  RepositoryStatus,
  SourceOfTruth,
} from "@prisma/client";
import {
  appAccessWhere,
  userHasAdminRole,
} from "@/features/app-requests/access";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  getPublishEligibility,
  type PublishEligibilityReason,
} from "./eligibility";
import { runPublishAttempt } from "./run-publish-attempt";

type QueueablePublishStatus = "NOT_STARTED" | "SUCCEEDED" | "FAILED";
type QueueablePublishingSetupStatus =
  | "NOT_CHECKED"
  | "READY"
  | "NEEDS_REPAIR"
  | "BLOCKED";

type PublishAppRequest = {
  id: string;
  sourceOfTruth: SourceOfTruth;
  repositoryStatus: RepositoryStatus;
  publishStatus: PublishStatus;
  publishingSetupStatus: PublishingSetupStatus | null;
  repositoryImport: {
    preparationStatus: RepositoryPreparationStatus;
  } | null;
};

type QueuePublishTransaction = {
  appRequest: {
    updateMany(args: Prisma.AppRequestUpdateManyArgs): Promise<{ count: number }>;
  };
  publishAttempt: {
    create(args: Prisma.PublishAttemptCreateArgs): Promise<{ id: string }>;
  };
};

type QueuePublishDb = {
  appRequest: {
    findFirst(
      args: Prisma.AppRequestFindFirstArgs,
    ): Promise<PublishAppRequest | null>;
  };
  $transaction<T>(
    callback: (transaction: QueuePublishTransaction) => Promise<T>,
  ): Promise<T>;
};

export type QueuedPublishResult = {
  attemptId: string;
  status: "QUEUED";
};

export type PublishActorInput = {
  requestId: string;
  actorUserId: string;
  source: "portal-ui" | "codex-mcp";
};

export type QueuePublishDependencies = {
  prisma: QueuePublishDb;
  appAccessWhere: typeof appAccessWhere;
  userHasAdminRole: typeof userHasAdminRole;
  getPublishEligibility: typeof getPublishEligibility;
  recordAuditEvent: typeof recordAuditEvent;
  runPublishAttempt: typeof runPublishAttempt;
};

export const defaultQueuePublishDependencies: QueuePublishDependencies = {
  prisma: prisma as unknown as QueuePublishDb,
  appAccessWhere,
  userHasAdminRole,
  getPublishEligibility,
  recordAuditEvent,
  runPublishAttempt,
};

type QueuePublishPolicy = {
  allowedPublishStatuses: QueueablePublishStatus[];
  allowFailedSetupRetry?: boolean;
};

const BLOCKING_SETUP_STATUSES = new Set([
  "NEEDS_REPAIR",
  "REPAIRING",
  "BLOCKED",
]);
const GENERATED_APP_QUEUEABLE_SETUP_STATUSES: QueueablePublishingSetupStatus[] = [
  "NOT_CHECKED",
  "READY",
];
const FAILED_RETRY_QUEUEABLE_SETUP_STATUSES: QueueablePublishingSetupStatus[] = [
  ...GENERATED_APP_QUEUEABLE_SETUP_STATUSES,
  "NEEDS_REPAIR",
  "BLOCKED",
];

function logPublishWorker(event: string, details: Record<string, unknown>) {
  console.info("[publish-worker]", event, details);
}

export function startPublishWorker(
  attemptId: string,
  dependencies: Pick<QueuePublishDependencies, "runPublishAttempt"> =
    defaultQueuePublishDependencies,
) {
  logPublishWorker("started", { publishAttemptId: attemptId });

  void dependencies
    .runPublishAttempt(attemptId)
    .then(() => {
      logPublishWorker("completed", { publishAttemptId: attemptId });
    })
    .catch(() => {
      console.error("[publish-worker]", "failed after queueing", {
        publishAttemptId: attemptId,
      });
    });
}

async function loadAccessibleAppRequest(
  input: PublishActorInput,
  dependencies: QueuePublishDependencies,
) {
  const actorIsAdmin = await dependencies.userHasAdminRole(input.actorUserId);
  const appRequest = await dependencies.prisma.appRequest.findFirst({
    where: dependencies.appAccessWhere(
      input.requestId,
      input.actorUserId,
      actorIsAdmin,
    ),
    include: { repositoryImport: true },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return appRequest;
}

function requirePublishEligibility(
  appRequest: PublishAppRequest,
  policy: QueuePublishPolicy,
  dependencies: QueuePublishDependencies,
) {
  const publishingSetupStatus =
    appRequest.publishingSetupStatus ?? "NOT_CHECKED";
  const eligibility = dependencies.getPublishEligibility(
    {
      sourceOfTruth: appRequest.sourceOfTruth,
      repositoryStatus: appRequest.repositoryStatus,
      preparationStatus: appRequest.repositoryImport?.preparationStatus,
      publishingSetupStatus,
      publishStatus: appRequest.publishStatus,
    },
    policy,
  );

  if (!eligibility.eligible) {
    throw new Error(
      publishEligibilityError({
        reason: eligibility.reason,
        sourceOfTruth: appRequest.sourceOfTruth,
        publishingSetupStatus,
        retryOnly:
          policy.allowedPublishStatuses.length === 1 &&
          policy.allowedPublishStatuses[0] === "FAILED",
      }),
    );
  }
}

function publishingSetupStatusPredicate(
  appRequest: Pick<PublishAppRequest, "sourceOfTruth">,
  allowFailedSetupRetry = false,
) {
  if (allowFailedSetupRetry) {
    return { in: FAILED_RETRY_QUEUEABLE_SETUP_STATUSES };
  }

  if (appRequest.sourceOfTruth === "IMPORTED_REPOSITORY") {
    return "READY" as const;
  }

  return { in: GENERATED_APP_QUEUEABLE_SETUP_STATUSES };
}

async function recordPublishRequested(
  input: PublishActorInput,
  publishAttemptId: string,
  dependencies: QueuePublishDependencies,
) {
  try {
    await dependencies.recordAuditEvent("PUBLISH_REQUESTED", {
      requestId: input.requestId,
      publishAttemptId,
      actorUserId: input.actorUserId,
      source: input.source,
    });
  } catch {
    console.error("Failed to record publish requested audit event.");
  }
}

export async function queuePublishAttemptForActor(
  input: PublishActorInput,
  policy: QueuePublishPolicy,
  dependencies: QueuePublishDependencies = defaultQueuePublishDependencies,
): Promise<QueuedPublishResult> {
  const appRequest = await loadAccessibleAppRequest(input, dependencies);
  requirePublishEligibility(appRequest, policy, dependencies);

  // Authorization and eligibility are deliberately re-read at the mutation
  // boundary so a stale page or revoked collaborator cannot claim a publish.
  const authorizedAppRequest = await loadAccessibleAppRequest(
    input,
    dependencies,
  );
  requirePublishEligibility(authorizedAppRequest, policy, dependencies);

  const attemptId = await dependencies.prisma.$transaction(async (tx) => {
    const queuedRequest = await tx.appRequest.updateMany({
      where: {
        id: input.requestId,
        repositoryStatus: "READY",
        publishingSetupStatus: publishingSetupStatusPredicate(
          authorizedAppRequest,
          policy.allowFailedSetupRetry,
        ),
        publishStatus: { in: policy.allowedPublishStatuses },
      },
      data: {
        publishStatus: "QUEUED",
        publishErrorSummary: null,
      },
    });

    if (queuedRequest.count !== 1) {
      throw new Error("Publish request is already queued or running.");
    }

    const attempt = await tx.publishAttempt.create({
      data: {
        appRequestId: input.requestId,
        status: "QUEUED",
        stage: "QUEUED",
      },
    });

    return attempt.id;
  });

  await recordPublishRequested(input, attemptId, dependencies);

  // The queued claim proves the caller was allowed to request work; re-read
  // access once more immediately before entering the provider orchestrator.
  await loadAccessibleAppRequest(input, dependencies);

  logPublishWorker("queued", {
    requestId: input.requestId,
    publishAttemptId: attemptId,
  });
  startPublishWorker(attemptId, dependencies);

  return { attemptId, status: "QUEUED" };
}

export async function queuePublishForActor(
  input: PublishActorInput,
  dependencies: QueuePublishDependencies = defaultQueuePublishDependencies,
): Promise<QueuedPublishResult> {
  return queuePublishAttemptForActor(
    input,
    { allowedPublishStatuses: ["NOT_STARTED", "SUCCEEDED"] },
    dependencies,
  );
}

function publishEligibilityError({
  reason,
  sourceOfTruth,
  publishingSetupStatus,
  retryOnly,
}: {
  reason: PublishEligibilityReason;
  sourceOfTruth: SourceOfTruth;
  publishingSetupStatus: PublishingSetupStatus;
  retryOnly: boolean;
}) {
  if (reason === "REPOSITORY_NOT_READY") {
    return "Managed repository is not ready for publishing.";
  }
  if (reason === "PREPARATION_NOT_COMMITTED") {
    return "Imported app repository preparation must be committed before publishing.";
  }
  if (reason === "PUBLISH_STATUS_NOT_ALLOWED") {
    return retryOnly
      ? "Only failed publish attempts can be retried."
      : "Publish request is already queued or running.";
  }
  if (BLOCKING_SETUP_STATUSES.has(publishingSetupStatus)) {
    return "Publishing setup must be repaired before publishing.";
  }
  if (sourceOfTruth === "IMPORTED_REPOSITORY") {
    return "Imported app publishing setup must be ready before publishing.";
  }
  return "Publishing setup must be ready before publishing.";
}
