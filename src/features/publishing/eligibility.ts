export function canQueuePublish(
  input: {
    sourceOfTruth: string;
    repositoryStatus: string;
    preparationStatus?: string | null;
    publishingSetupStatus: string;
    publishStatus: string;
  },
  options: {
    allowedPublishStatuses: string[];
    allowFailedSetupRetry?: boolean;
  },
) {
  if (
    input.repositoryStatus !== "READY" ||
    !options.allowedPublishStatuses.includes(input.publishStatus)
  ) {
    return false;
  }

  if (
    input.sourceOfTruth === "IMPORTED_REPOSITORY" &&
    input.preparationStatus !== "COMMITTED"
  ) {
    return false;
  }

  if (options.allowFailedSetupRetry) {
    return ["NOT_CHECKED", "READY", "NEEDS_REPAIR", "BLOCKED"].includes(
      input.publishingSetupStatus,
    );
  }

  if (input.sourceOfTruth === "IMPORTED_REPOSITORY") {
    return input.publishingSetupStatus === "READY";
  }

  return (
    input.publishingSetupStatus === "NOT_CHECKED" ||
    input.publishingSetupStatus === "READY"
  );
}
