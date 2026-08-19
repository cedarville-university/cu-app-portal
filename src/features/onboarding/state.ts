import type {
  PublishStatus,
  PublishingSetupStatus,
  RepositoryAccessStatus,
  RepositoryCompatibilityStatus,
  RepositoryImportStatus,
  RepositoryPreparationMode,
  RepositoryPreparationStatus,
  RepositoryStatus,
  SourceOfTruth,
} from "@prisma/client";
import { canQueuePublish } from "@/features/publishing/eligibility";

export type OnboardingPathChoice = "starter" | "customize" | null;

export type OnboardingStateInput = {
  sourceOfTruth: SourceOfTruth;
  repositoryStatus: RepositoryStatus;
  repositoryUrl: string | null;
  repositoryAccessStatus: RepositoryAccessStatus;
  importStatus: RepositoryImportStatus | null;
  preparationStatus: RepositoryPreparationStatus | null;
  preparationMode: RepositoryPreparationMode | null;
  compatibilityStatus: RepositoryCompatibilityStatus | null;
  publishingSetupStatus: PublishingSetupStatus;
  publishStatus: PublishStatus;
  isLocalSource: boolean;
  pathChoice: OnboardingPathChoice;
};

export type OnboardingState =
  | { kind: "REPOSITORY_PENDING" }
  | { kind: "REPOSITORY_FAILED" }
  | { kind: "IMPORT_FAILED" }
  | { kind: "GENERATED_PATH_CHOICE" }
  | {
      kind: "GITHUB_ACCOUNT_REQUIRED";
      resume: "customize" | "local" | "review";
    }
  | { kind: "GITHUB_INVITATION_PENDING" }
  | { kind: "CODEX_CUSTOMIZATION" }
  | { kind: "LOCAL_CODE_UPLOAD" }
  | { kind: "LOCAL_CODE_REPAIR" }
  | { kind: "PREPARATION_READY" }
  | { kind: "PREPARATION_RUNNING" }
  | {
      kind: "PREPARATION_FAILED";
      retryMode: "DIRECT_COMMIT" | "PULL_REQUEST";
    }
  | { kind: "PREPARATION_CONFLICT" }
  | { kind: "PREPARATION_REVIEW_OPEN" }
  | { kind: "PUBLISHING_SETUP_NOT_STARTED" }
  | { kind: "PUBLISHING_SETUP_CHECKING" }
  | { kind: "PUBLISHING_SETUP_REPAIR_REQUIRED" }
  | { kind: "READY_TO_PUBLISH" }
  | { kind: "PUBLISHING" }
  | { kind: "PUBLISH_FAILED" }
  | { kind: "PUBLISH_DELETED" }
  | { kind: "PUBLISHED" };

function githubAccessState(
  input: OnboardingStateInput,
  resume: "customize" | "local" | "review",
): OnboardingState {
  switch (input.repositoryAccessStatus) {
    case "GRANTED":
      return resume === "customize"
        ? { kind: "CODEX_CUSTOMIZATION" }
        : resume === "local"
          ? { kind: "LOCAL_CODE_UPLOAD" }
          : { kind: "PREPARATION_CONFLICT" };
    case "INVITED":
      return { kind: "GITHUB_INVITATION_PENDING" };
    case "NOT_REQUESTED":
    case "FAILED":
      return { kind: "GITHUB_ACCOUNT_REQUIRED", resume };
    default:
      input.repositoryAccessStatus satisfies never;
      return { kind: "GITHUB_ACCOUNT_REQUIRED", resume };
  }
}

function isPublishEligible(input: OnboardingStateInput) {
  return canQueuePublish(input, { allowedPublishStatuses: ["NOT_STARTED"] });
}

export function deriveOnboardingState(
  input: OnboardingStateInput,
): OnboardingState {
  switch (input.publishStatus) {
    case "SUCCEEDED":
      return { kind: "PUBLISHED" };
    case "DELETED":
      return { kind: "PUBLISH_DELETED" };
    case "QUEUED":
    case "PROVISIONING":
    case "DEPLOYING":
      return { kind: "PUBLISHING" };
    case "FAILED":
      return { kind: "PUBLISH_FAILED" };
    case "NOT_STARTED":
      break;
    default:
      input.publishStatus satisfies never;
  }

  if (input.importStatus === "FAILED") return { kind: "IMPORT_FAILED" };

  switch (input.repositoryStatus) {
    case "FAILED":
      return { kind: "REPOSITORY_FAILED" };
    case "PENDING":
      return { kind: "REPOSITORY_PENDING" };
    case "READY":
    case "DELETED":
      break;
    default:
      input.repositoryStatus satisfies never;
  }

  const isImported = input.sourceOfTruth === "IMPORTED_REPOSITORY";
  if (isImported || input.isLocalSource) {
    if (
      input.preparationStatus === "BLOCKED" &&
      input.compatibilityStatus === "CONFLICTED"
    ) {
      return githubAccessState(input, "review");
    }

    if (input.isLocalSource && input.repositoryAccessStatus !== "GRANTED") {
      return githubAccessState(input, "local");
    }

    if (
      input.isLocalSource &&
      input.preparationStatus === "PENDING_USER_CHOICE" &&
      input.compatibilityStatus === "UNSUPPORTED"
    ) {
      return { kind: "LOCAL_CODE_REPAIR" };
    }

    if (input.isLocalSource && input.preparationStatus === "PENDING_USER_CHOICE") {
      return { kind: "LOCAL_CODE_UPLOAD" };
    }

    if (input.preparationStatus === "PENDING_USER_CHOICE") {
      return { kind: "PREPARATION_READY" };
    }
    if (input.preparationStatus === "RUNNING") {
      return { kind: "PREPARATION_RUNNING" };
    }
    if (input.preparationStatus === "FAILED") {
      if (
        input.preparationMode === "PULL_REQUEST" &&
        input.repositoryAccessStatus !== "GRANTED"
      ) {
        return githubAccessState(input, "review");
      }

      return {
        kind: "PREPARATION_FAILED",
        retryMode:
          input.preparationMode === "PULL_REQUEST"
            ? "PULL_REQUEST"
            : "DIRECT_COMMIT",
      };
    }
    if (input.preparationStatus === "PULL_REQUEST_OPENED") {
      return { kind: "PREPARATION_REVIEW_OPEN" };
    }
    if (input.preparationStatus === "BLOCKED") {
      return { kind: "PREPARATION_CONFLICT" };
    }
  }

  if (
    input.publishingSetupStatus === "CHECKING" ||
    input.publishingSetupStatus === "REPAIRING"
  ) {
    return { kind: "PUBLISHING_SETUP_CHECKING" };
  }
  if (
    input.publishingSetupStatus === "NEEDS_REPAIR" ||
    input.publishingSetupStatus === "BLOCKED"
  ) {
    return { kind: "PUBLISHING_SETUP_REPAIR_REQUIRED" };
  }
  if (isImported && input.publishingSetupStatus === "NOT_CHECKED") {
    return { kind: "PUBLISHING_SETUP_NOT_STARTED" };
  }

  if (!isImported && !input.isLocalSource) {
    if (input.pathChoice === null) {
      return { kind: "GENERATED_PATH_CHOICE" };
    }

    if (input.pathChoice === "customize") {
      return githubAccessState(input, "customize");
    }
  }

  if (isPublishEligible(input)) return { kind: "READY_TO_PUBLISH" };

  return { kind: "PUBLISHING_SETUP_NOT_STARTED" };
}
