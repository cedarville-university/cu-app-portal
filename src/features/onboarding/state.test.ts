import { describe, expect, it } from "vitest";
import { deriveOnboardingState, type OnboardingStateInput } from "./state";

const generatedReady: OnboardingStateInput = {
  sourceOfTruth: "PORTAL_MANAGED_REPO",
  repositoryStatus: "READY",
  repositoryUrl: "https://github.com/cedarville-it/campus-app",
  repositoryAccessStatus: "NOT_REQUESTED",
  importStatus: null,
  preparationStatus: null,
  preparationMode: null,
  compatibilityStatus: null,
  publishingSetupStatus: "NOT_CHECKED",
  publishStatus: "NOT_STARTED",
  isLocalSource: false,
  pathChoice: null,
};

function generated(
  overrides: Partial<OnboardingStateInput> = {},
): OnboardingStateInput {
  return { ...generatedReady, ...overrides };
}

function imported(
  overrides: Partial<OnboardingStateInput> = {},
): OnboardingStateInput {
  return {
    ...generatedReady,
    sourceOfTruth: "IMPORTED_REPOSITORY",
    importStatus: "SUCCEEDED",
    preparationStatus: "PENDING_USER_CHOICE",
    preparationMode: "DIRECT_COMMIT",
    compatibilityStatus: "COMPATIBLE",
    publishingSetupStatus: "READY",
    ...overrides,
  };
}

function local(
  overrides: Partial<OnboardingStateInput> = {},
): OnboardingStateInput {
  return {
    ...imported(),
    isLocalSource: true,
    ...overrides,
  };
}

describe("deriveOnboardingState generated apps", () => {
  it.each([
    [{ ...generatedReady, repositoryStatus: "PENDING" }, "REPOSITORY_PENDING"],
    [{ ...generatedReady, repositoryStatus: "FAILED" }, "REPOSITORY_FAILED"],
    [generatedReady, "GENERATED_PATH_CHOICE"],
    [{ ...generatedReady, pathChoice: "starter" }, "READY_TO_PUBLISH"],
    [
      { ...generatedReady, pathChoice: "customize" },
      "GITHUB_ACCOUNT_REQUIRED",
    ],
    [
      { ...generatedReady, repositoryAccessStatus: "INVITED" },
      "GITHUB_INVITATION_PENDING",
    ],
    [
      { ...generatedReady, repositoryAccessStatus: "GRANTED" },
      "CODEX_CUSTOMIZATION",
    ],
  ] satisfies Array<[OnboardingStateInput, string]>)(
    "maps %# to %s",
    (input, expected) => {
      expect(deriveOnboardingState(input).kind).toBe(expected);
    },
  );
});

describe("deriveOnboardingState workflow states", () => {
  it.each([
    [imported({ importStatus: "FAILED" }), "IMPORT_FAILED"],
    [
      imported({ preparationStatus: "PENDING_USER_CHOICE" }),
      "PREPARATION_READY",
    ],
    [imported({ preparationStatus: "RUNNING" }), "PREPARATION_RUNNING"],
    [imported({ preparationStatus: "FAILED" }), "PREPARATION_FAILED"],
    [
      imported({
        preparationStatus: "BLOCKED",
        compatibilityStatus: "CONFLICTED",
      }),
      "GITHUB_ACCOUNT_REQUIRED",
    ],
    [
      imported({
        preparationStatus: "BLOCKED",
        compatibilityStatus: "CONFLICTED",
        repositoryAccessStatus: "GRANTED",
      }),
      "PREPARATION_CONFLICT",
    ],
    [
      imported({ preparationStatus: "PULL_REQUEST_OPENED" }),
      "PREPARATION_REVIEW_OPEN",
    ],
    [
      imported({
        preparationStatus: "COMMITTED",
        publishingSetupStatus: "NOT_CHECKED",
      }),
      "PUBLISHING_SETUP_NOT_STARTED",
    ],
    [
      imported({
        preparationStatus: "COMMITTED",
        publishingSetupStatus: "READY",
      }),
      "READY_TO_PUBLISH",
    ],
    [
      imported({
        preparationStatus: "COMMITTED",
        publishingSetupStatus: "NEEDS_REPAIR",
      }),
      "PUBLISHING_SETUP_REPAIR_REQUIRED",
    ],
    [
      local({
        preparationStatus: "PENDING_USER_CHOICE",
        repositoryAccessStatus: "GRANTED",
      }),
      "LOCAL_CODE_UPLOAD",
    ],
    [generated({ publishStatus: "QUEUED" }), "PUBLISHING"],
    [generated({ publishStatus: "PROVISIONING" }), "PUBLISHING"],
    [generated({ publishStatus: "DEPLOYING" }), "PUBLISHING"],
    [generated({ publishStatus: "FAILED" }), "PUBLISH_FAILED"],
    [generated({ publishStatus: "SUCCEEDED" }), "PUBLISHED"],
    [generated({ publishStatus: "DELETED" }), "PUBLISH_DELETED"],
  ] satisfies Array<[OnboardingStateInput, string]>)(
    "maps workflow state %# to %s",
    (input, expected) => {
      expect(deriveOnboardingState(input).kind).toBe(expected);
    },
  );

  it("keeps preparation retry mode in the state", () => {
    expect(
      deriveOnboardingState(
        imported({ preparationStatus: "FAILED", preparationMode: "PULL_REQUEST" }),
      ),
    ).toEqual({ kind: "PREPARATION_FAILED", retryMode: "PULL_REQUEST" });
  });

  it("records which GitHub step resumes after access is granted", () => {
    expect(
      deriveOnboardingState(generated({ pathChoice: "customize" })),
    ).toEqual({ kind: "GITHUB_ACCOUNT_REQUIRED", resume: "customize" });
    expect(
      deriveOnboardingState(
        local({ repositoryAccessStatus: "NOT_REQUESTED" }),
      ),
    ).toEqual({ kind: "GITHUB_ACCOUNT_REQUIRED", resume: "local" });
    expect(
      deriveOnboardingState(
        imported({
          preparationStatus: "BLOCKED",
          compatibilityStatus: "CONFLICTED",
        }),
      ),
    ).toEqual({ kind: "GITHUB_ACCOUNT_REQUIRED", resume: "review" });
  });
});
