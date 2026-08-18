import { canQueuePublish } from "@/features/publishing/eligibility";

export type OnboardingPathChoice = "starter" | "customize" | null;

export type OnboardingStateInput = {
  sourceOfTruth: string;
  repositoryStatus: string;
  repositoryUrl: string | null;
  repositoryAccessStatus: string;
  importStatus: string | null;
  preparationStatus: string | null;
  preparationMode: string | null;
  compatibilityStatus: string | null;
  publishingSetupStatus: string;
  publishStatus: string;
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
  if (input.repositoryAccessStatus === "GRANTED") {
    return resume === "customize"
      ? { kind: "CODEX_CUSTOMIZATION" }
      : resume === "local"
        ? { kind: "LOCAL_CODE_UPLOAD" }
        : { kind: "PREPARATION_CONFLICT" };
  }

  if (input.repositoryAccessStatus === "INVITED") {
    return { kind: "GITHUB_INVITATION_PENDING" };
  }

  return { kind: "GITHUB_ACCOUNT_REQUIRED", resume };
}

function isPublishEligible(input: OnboardingStateInput) {
  return canQueuePublish(input, { allowedPublishStatuses: ["NOT_STARTED"] });
}

export function deriveOnboardingState(
  input: OnboardingStateInput,
): OnboardingState {
  if (input.publishStatus === "SUCCEEDED") return { kind: "PUBLISHED" };
  if (input.publishStatus === "DELETED") return { kind: "PUBLISH_DELETED" };
  if (["QUEUED", "PROVISIONING", "DEPLOYING"].includes(input.publishStatus)) {
    return { kind: "PUBLISHING" };
  }
  if (input.publishStatus === "FAILED") return { kind: "PUBLISH_FAILED" };

  if (input.repositoryStatus === "FAILED") return { kind: "REPOSITORY_FAILED" };
  if (input.repositoryStatus === "PENDING") return { kind: "REPOSITORY_PENDING" };

  if (input.importStatus === "FAILED") return { kind: "IMPORT_FAILED" };

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
    if (input.repositoryAccessStatus === "INVITED") {
      return { kind: "GITHUB_INVITATION_PENDING" };
    }
    if (input.repositoryAccessStatus === "GRANTED") {
      return { kind: "CODEX_CUSTOMIZATION" };
    }
    if (input.pathChoice === "customize") {
      return { kind: "GITHUB_ACCOUNT_REQUIRED", resume: "customize" };
    }
    if (input.pathChoice !== "starter") {
      return { kind: "GENERATED_PATH_CHOICE" };
    }
  }

  if (isPublishEligible(input)) return { kind: "READY_TO_PUBLISH" };

  return { kind: "PUBLISHING_SETUP_NOT_STARTED" };
}
