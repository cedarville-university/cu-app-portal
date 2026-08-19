import type {
  PublishStatus,
  PublishingSetupStatus,
  RepositoryPreparationStatus,
  RepositoryStatus,
  SourceOfTruth,
} from "@prisma/client";

export type PublishEligibilityInput = {
  sourceOfTruth: SourceOfTruth;
  repositoryStatus: RepositoryStatus;
  preparationStatus?: RepositoryPreparationStatus | null;
  publishingSetupStatus: PublishingSetupStatus;
  publishStatus: PublishStatus;
};

export type PublishEligibilityReason =
  | "REPOSITORY_NOT_READY"
  | "PREPARATION_NOT_COMMITTED"
  | "PUBLISH_STATUS_NOT_ALLOWED"
  | "PUBLISHING_SETUP_IN_PROGRESS"
  | "PUBLISHING_SETUP_NOT_READY"
  | "PUBLISHING_SETUP_ACTION_NOT_ALLOWED";

export type PublishEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: PublishEligibilityReason };

type PublishEligibilityOptions = {
  allowedPublishStatuses: readonly PublishStatus[];
  allowFailedSetupRetry?: boolean;
};

export function getPublishEligibility(
  input: PublishEligibilityInput,
  options: PublishEligibilityOptions,
): PublishEligibilityResult {
  if (input.repositoryStatus !== "READY") {
    return { eligible: false, reason: "REPOSITORY_NOT_READY" };
  }

  if (
    input.sourceOfTruth === "IMPORTED_REPOSITORY" &&
    input.preparationStatus !== "COMMITTED"
  ) {
    return { eligible: false, reason: "PREPARATION_NOT_COMMITTED" };
  }

  if (!options.allowedPublishStatuses.includes(input.publishStatus)) {
    return { eligible: false, reason: "PUBLISH_STATUS_NOT_ALLOWED" };
  }

  if (
    input.publishingSetupStatus === "CHECKING" ||
    input.publishingSetupStatus === "REPAIRING"
  ) {
    return { eligible: false, reason: "PUBLISHING_SETUP_IN_PROGRESS" };
  }

  if (options.allowFailedSetupRetry) {
    return ["NOT_CHECKED", "READY", "NEEDS_REPAIR", "BLOCKED"].includes(
      input.publishingSetupStatus,
    )
      ? { eligible: true }
      : { eligible: false, reason: "PUBLISHING_SETUP_NOT_READY" };
  }

  const setupIsReady =
    input.sourceOfTruth === "IMPORTED_REPOSITORY"
      ? input.publishingSetupStatus === "READY"
      : input.publishingSetupStatus === "NOT_CHECKED" ||
        input.publishingSetupStatus === "READY";

  return setupIsReady
    ? { eligible: true }
    : { eligible: false, reason: "PUBLISHING_SETUP_NOT_READY" };
}

export function canQueuePublish(
  input: PublishEligibilityInput,
  options: {
    allowedPublishStatuses: readonly PublishStatus[];
    allowFailedSetupRetry?: boolean;
  },
) {
  return getPublishEligibility(input, options).eligible;
}

export function getPublishingSetupRepairEligibility(
  input: PublishEligibilityInput,
): PublishEligibilityResult {
  if (input.repositoryStatus !== "READY") {
    return { eligible: false, reason: "REPOSITORY_NOT_READY" };
  }

  if (
    input.sourceOfTruth === "IMPORTED_REPOSITORY" &&
    input.preparationStatus !== "COMMITTED"
  ) {
    return { eligible: false, reason: "PREPARATION_NOT_COMMITTED" };
  }

  if (!["NOT_STARTED", "FAILED", "SUCCEEDED"].includes(input.publishStatus)) {
    return { eligible: false, reason: "PUBLISH_STATUS_NOT_ALLOWED" };
  }

  if (
    input.publishingSetupStatus === "CHECKING" ||
    input.publishingSetupStatus === "REPAIRING"
  ) {
    return { eligible: false, reason: "PUBLISHING_SETUP_IN_PROGRESS" };
  }

  return ["NOT_CHECKED", "NEEDS_REPAIR", "BLOCKED"].includes(
    input.publishingSetupStatus,
  )
    ? { eligible: true }
    : { eligible: false, reason: "PUBLISHING_SETUP_ACTION_NOT_ALLOWED" };
}
