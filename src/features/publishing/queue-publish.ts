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
import { PortalApiError } from "@/features/portal-api/errors";
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
  publishErrorSummary: string | null;
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
    updateMany(args: Prisma.PublishAttemptUpdateManyArgs): Promise<{ count: number }>;
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
  portalOperation?: string;
  idempotencyKey?: string;
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
  authorizeProviderMutation?: () => Promise<void>,
) {
  logPublishWorker("started", { publishAttemptId: attemptId });

  void dependencies
    .runPublishAttempt(attemptId, undefined, authorizeProviderMutation)
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
  let appRequest: PublishAppRequest | null;
  try {
    const actorIsAdmin = await dependencies.userHasAdminRole(input.actorUserId);
    appRequest = await dependencies.prisma.appRequest.findFirst({
      where: dependencies.appAccessWhere(
        input.requestId,
        input.actorUserId,
        actorIsAdmin,
      ),
      include: { repositoryImport: true },
    });
  } catch {
    throw new PortalApiError(
      "PROVIDER_FAILURE",
      "App access could not be confirmed.",
    );
  }

  if (!appRequest) {
    throw new PortalApiError("NOT_FOUND", "App not found.");
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
    throw publishEligibilityError({
        reason: eligibility.reason,
        sourceOfTruth: appRequest.sourceOfTruth,
        publishingSetupStatus,
        retryOnly:
          policy.allowedPublishStatuses.length === 1 &&
          policy.allowedPublishStatuses[0] === "FAILED",
      });
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
      ...(input.portalOperation && input.idempotencyKey
        ? {
            operation: input.portalOperation,
            idempotencyKey: input.idempotencyKey,
          }
        : {}),
    });
  } catch {
    console.error("Failed to record publish requested audit event.");
  }
}

async function settleQueuedClaimAfterAuthorizationLoss(
  input: PublishActorInput,
  attemptId: string,
  previousRequest: PublishAppRequest,
  dependencies: QueuePublishDependencies,
) {
  await dependencies.prisma.$transaction(async (tx) => {
    const settledAttempt = await tx.publishAttempt.updateMany({
      where: {
        id: attemptId,
        appRequestId: input.requestId,
        status: "QUEUED",
        stage: "QUEUED",
      },
      data: {
        status: "FAILED",
        stage: "FAILED",
        errorSummary:
          "Publishing stopped because app access could not be confirmed.",
        finishedAt: new Date(),
      },
    });

    if (settledAttempt.count === 1) {
      await tx.appRequest.updateMany({
        where: { id: input.requestId, publishStatus: "QUEUED" },
        data: {
          publishStatus: previousRequest.publishStatus,
          publishErrorSummary: previousRequest.publishErrorSummary,
        },
      });
    }
  });
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
        sourceOfTruth: authorizedAppRequest.sourceOfTruth,
        repositoryStatus: "READY",
        ...(authorizedAppRequest.sourceOfTruth === "IMPORTED_REPOSITORY"
          ? {
              repositoryImport: {
                is: { preparationStatus: "COMMITTED" },
              },
            }
          : {}),
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
      throw new PortalApiError(
        "CONFLICT",
        "Publish request is already queued or running.",
      );
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
  try {
    await loadAccessibleAppRequest(input, dependencies);
  } catch (error) {
    await settleQueuedClaimAfterAuthorizationLoss(
      input,
      attemptId,
      authorizedAppRequest,
      dependencies,
    );
    throw error;
  }

  logPublishWorker("queued", {
    requestId: input.requestId,
    publishAttemptId: attemptId,
  });
  startPublishWorker(
    attemptId,
    dependencies,
    async () => {
      await loadAccessibleAppRequest(input, dependencies);
    },
  );

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
    return new PortalApiError(
      "ACTION_REQUIRED",
      "Managed repository is not ready for publishing.",
    );
  }
  if (reason === "PREPARATION_NOT_COMMITTED") {
    return new PortalApiError(
      "ACTION_REQUIRED",
      "Imported app repository preparation must be committed before publishing.",
    );
  }
  if (reason === "PUBLISH_STATUS_NOT_ALLOWED") {
    return new PortalApiError(
      "CONFLICT",
      retryOnly
        ? "Only failed publish attempts can be retried."
        : "Publish request is already queued or running.",
    );
  }
  if (BLOCKING_SETUP_STATUSES.has(publishingSetupStatus)) {
    return new PortalApiError(
      "SETUP_REPAIR_REQUIRED",
      "Publishing setup must be repaired before publishing.",
    );
  }
  if (sourceOfTruth === "IMPORTED_REPOSITORY") {
    return new PortalApiError(
      "ACTION_REQUIRED",
      "Imported app publishing setup must be ready before publishing.",
    );
  }
  return new PortalApiError(
    "ACTION_REQUIRED",
    "Publishing setup must be ready before publishing.",
  );
}
