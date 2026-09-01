import type {
  Prisma,
  PublishingSetupStatus,
  PublishStatus,
  RepositoryPreparationStatus,
  RepositoryStatus,
  SourceOfTruth,
} from "@prisma/client";
import {
  appAccessWhere,
  userHasAdminRole,
} from "@/features/app-requests/access";
import { PortalApiError } from "@/features/portal-api/errors";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { getPublishingSetupRepairEligibility } from "@/features/publishing/eligibility";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { repairPublishingSetup } from "./service";

const SETUP_REPAIR_FAILURE_SUMMARY =
  "Publishing setup could not be completed. Share the support reference with the portal support team.";

type RepairableAppRequest = {
  id: string;
  sourceOfTruth: SourceOfTruth;
  repositoryStatus: RepositoryStatus;
  publishStatus: PublishStatus;
  publishingSetupStatus: PublishingSetupStatus;
  publishingSetupErrorSummary: string | null;
  repositoryImport: {
    preparationStatus: RepositoryPreparationStatus;
  } | null;
};

type RepairPublishingSetupDb = {
  appRequest: {
    findFirst(
      args: Prisma.AppRequestFindFirstArgs,
    ): Promise<RepairableAppRequest | null>;
    findUnique(
      args: Prisma.AppRequestFindUniqueArgs,
    ): Promise<{ publishingSetupStatus: PublishingSetupStatus } | null>;
    updateMany(args: Prisma.AppRequestUpdateManyArgs): Promise<{ count: number }>;
  };
};

export type RepairPublishingSetupDependencies = {
  prisma: RepairPublishingSetupDb;
  appAccessWhere: typeof appAccessWhere;
  userHasAdminRole: typeof userHasAdminRole;
  getPublishingSetupRepairEligibility: typeof getPublishingSetupRepairEligibility;
  repairPublishingSetup: typeof repairPublishingSetup;
  safeNotifyAppEvent: typeof safeNotifyAppEvent;
  recordAuditEvent: typeof recordAuditEvent;
};

const defaultDependencies: RepairPublishingSetupDependencies = {
  prisma: prisma as unknown as RepairPublishingSetupDb,
  appAccessWhere,
  userHasAdminRole,
  getPublishingSetupRepairEligibility,
  repairPublishingSetup,
  safeNotifyAppEvent,
  recordAuditEvent,
};

export type RepairPublishingSetupInput = {
  requestId: string;
  actorUserId: string;
  source: "portal-ui" | "codex-mcp";
  portalOperation?: string;
  idempotencyKey?: string;
};

function isStaleRepairAttempt(error: unknown) {
  return (
    error instanceof Error &&
    error.name === "StalePublishingSetupRepairAttemptError"
  );
}

async function loadAccessibleAppRequest(
  input: RepairPublishingSetupInput,
  dependencies: RepairPublishingSetupDependencies,
) {
  let appRequest: RepairableAppRequest | null;
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

function requireRepairEligibility(
  appRequest: RepairableAppRequest,
  dependencies: RepairPublishingSetupDependencies,
) {
  const eligibility = dependencies.getPublishingSetupRepairEligibility({
    sourceOfTruth: appRequest.sourceOfTruth,
    repositoryStatus: appRequest.repositoryStatus,
    preparationStatus: appRequest.repositoryImport?.preparationStatus,
    publishingSetupStatus: appRequest.publishingSetupStatus,
    publishStatus: appRequest.publishStatus,
  });

  if (!eligibility.eligible) {
    throw publishingSetupEligibilityError(eligibility.reason);
  }
}

async function readRepairStatus(
  requestId: string,
  fallback: PublishingSetupStatus,
  dependencies: RepairPublishingSetupDependencies,
) {
  try {
    const appRequest = await dependencies.prisma.appRequest.findUnique({
      where: { id: requestId },
      select: { publishingSetupStatus: true },
    });

    return appRequest?.publishingSetupStatus ?? fallback;
  } catch {
    console.error("Failed to inspect repaired publishing setup status.", {
      requestId,
    });
    return fallback;
  }
}

async function notifyBlockedActor(
  input: RepairPublishingSetupInput,
  dependencies: RepairPublishingSetupDependencies,
) {
  try {
    await dependencies.safeNotifyAppEvent({
      appRequestId: input.requestId,
      eventKey: "PUBLISHING_SETUP_BLOCKED",
      actorUserId: input.actorUserId,
      directRecipientUserIds: [input.actorUserId],
    });
  } catch {
    console.error("Failed to notify the actor about blocked publishing setup.", {
      requestId: input.requestId,
      source: input.source,
    });
  }
}

async function restoreClaimAfterAuthorizationLoss(
  input: RepairPublishingSetupInput,
  appRequest: RepairableAppRequest,
  attemptClaimedAt: Date,
  dependencies: RepairPublishingSetupDependencies,
) {
  await dependencies.prisma.appRequest.updateMany({
    where: {
      id: input.requestId,
      publishingSetupStatus: "REPAIRING",
      updatedAt: attemptClaimedAt,
    },
    data: {
      publishingSetupStatus: appRequest.publishingSetupStatus,
      publishingSetupErrorSummary: appRequest.publishingSetupErrorSummary,
    },
  });
}

export async function repairPublishingSetupForActor(
  input: RepairPublishingSetupInput,
  dependencies: RepairPublishingSetupDependencies = defaultDependencies,
): Promise<{ status: PublishingSetupStatus }> {
  const appRequest = await loadAccessibleAppRequest(input, dependencies);
  requireRepairEligibility(appRequest, dependencies);

  const attemptClaimedAt = new Date();
  const claimed = await dependencies.prisma.appRequest.updateMany({
    where: {
      id: input.requestId,
      sourceOfTruth: appRequest.sourceOfTruth,
      repositoryStatus: "READY",
      publishStatus: appRequest.publishStatus,
      publishingSetupStatus: appRequest.publishingSetupStatus,
      ...(appRequest.sourceOfTruth === "IMPORTED_REPOSITORY"
        ? {
            repositoryImport: {
              is: { preparationStatus: "COMMITTED" },
            },
          }
        : {}),
    },
    data: {
      publishingSetupStatus: "REPAIRING",
      publishingSetupErrorSummary: null,
      updatedAt: attemptClaimedAt,
    },
  });

  if (claimed.count !== 1) {
    throw new PortalApiError(
      "CONFLICT",
      "Publishing setup is already being checked or repaired.",
    );
  }

  try {
    await dependencies.recordAuditEvent("PUBLISHING_SETUP_REPAIR_REQUESTED", {
      requestId: input.requestId,
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
    console.error("Failed to record publishing setup repair audit event.", {
      requestId: input.requestId,
      source: input.source,
    });
  }

  try {
    // This is the authorization boundary for the provider service, which owns
    // the individual Azure, Entra, and GitHub setup mutations.
    await loadAccessibleAppRequest(input, dependencies);
  } catch (error) {
    await restoreClaimAfterAuthorizationLoss(
      input,
      appRequest,
      attemptClaimedAt,
      dependencies,
    );
    throw error;
  }

  try {
    await dependencies.repairPublishingSetup(input.requestId, undefined, {
      statusAlreadyClaimed: true,
      attemptClaimedAt,
      authorizeProviderMutation: async () => {
        await loadAccessibleAppRequest(input, dependencies);
      },
    });

    const status = await readRepairStatus(
      input.requestId,
      appRequest.publishingSetupStatus,
      dependencies,
    );
    if (status === "BLOCKED") {
      await notifyBlockedActor(input, dependencies);
    }
    return { status };
  } catch (error) {
    if (isStaleRepairAttempt(error)) {
      console.warn(
        "Publishing setup repair attempt skipped after its claim changed.",
        { requestId: input.requestId, source: input.source },
      );
      return {
        status: await readRepairStatus(
          input.requestId,
          appRequest.publishingSetupStatus,
          dependencies,
        ),
      };
    }

    const failureStatus =
      appRequest.publishingSetupStatus === "BLOCKED"
        ? "BLOCKED"
        : "NEEDS_REPAIR";
    const failed = await dependencies.prisma.appRequest.updateMany({
      where: {
        id: input.requestId,
        publishingSetupStatus: "REPAIRING",
        updatedAt: attemptClaimedAt,
      },
      data: {
        publishingSetupStatus: failureStatus,
        publishingSetupErrorSummary: SETUP_REPAIR_FAILURE_SUMMARY,
      },
    });

    console.error("Publishing setup repair failed.", {
      requestId: input.requestId,
      source: input.source,
      failureStage: "provider-setup",
    });
    if (failed.count !== 1) {
      const status = await readRepairStatus(
        input.requestId,
        appRequest.publishingSetupStatus,
        dependencies,
      );
      if (status === "BLOCKED") {
        await notifyBlockedActor(input, dependencies);
      }
      return {
        status,
      };
    }
    if (failureStatus === "BLOCKED") {
      await notifyBlockedActor(input, dependencies);
    }
    return { status: failureStatus };
  }
}

function publishingSetupEligibilityError(
  reason: Exclude<
    ReturnType<typeof getPublishingSetupRepairEligibility>,
    { eligible: true }
  >["reason"],
) {
  switch (reason) {
    case "REPOSITORY_NOT_READY":
      return new PortalApiError(
        "ACTION_REQUIRED",
        "Managed repository is not ready for publishing setup.",
      );
    case "PREPARATION_NOT_COMMITTED":
      return new PortalApiError(
        "ACTION_REQUIRED",
        "Imported repository preparation must be committed before publishing setup.",
      );
    case "PUBLISH_STATUS_NOT_ALLOWED":
      return new PortalApiError(
        "ACTION_REQUIRED",
        "Publishing setup cannot be changed while publishing is active or unavailable.",
      );
    case "PUBLISHING_SETUP_IN_PROGRESS":
      return new PortalApiError(
        "CONFLICT",
        "Publishing setup is already being checked or repaired.",
      );
    case "PUBLISHING_SETUP_ACTION_NOT_ALLOWED":
      return new PortalApiError(
        "ACTION_REQUIRED",
        "Publishing setup cannot be started or repaired from its current state.",
      );
    case "PUBLISHING_SETUP_NOT_READY":
      return new PortalApiError(
        "SETUP_REPAIR_REQUIRED",
        "Publishing setup is not ready for this action.",
      );
  }
}
