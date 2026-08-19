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
import { describe, expect, expectTypeOf, it } from "vitest";
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

expectTypeOf<OnboardingStateInput["sourceOfTruth"]>().toEqualTypeOf<SourceOfTruth>();
expectTypeOf<
  OnboardingStateInput["repositoryStatus"]
>().toEqualTypeOf<RepositoryStatus>();
expectTypeOf<
  OnboardingStateInput["repositoryAccessStatus"]
>().toEqualTypeOf<RepositoryAccessStatus>();
expectTypeOf<
  OnboardingStateInput["publishingSetupStatus"]
>().toEqualTypeOf<PublishingSetupStatus>();
expectTypeOf<
  OnboardingStateInput["publishStatus"]
>().toEqualTypeOf<PublishStatus>();

const onboardingWorkflowValues = {
  sourceOfTruth: {
    PORTAL_MANAGED_REPO: true,
    IMPORTED_REPOSITORY: true,
  } satisfies Record<SourceOfTruth, true>,
  repositoryStatus: {
    PENDING: true,
    READY: true,
    FAILED: true,
    DELETED: true,
  } satisfies Record<RepositoryStatus, true>,
  repositoryAccessStatus: {
    NOT_REQUESTED: true,
    INVITED: true,
    GRANTED: true,
    FAILED: true,
  } satisfies Record<RepositoryAccessStatus, true>,
  importStatus: {
    NOT_REQUIRED: true,
    PENDING: true,
    RUNNING: true,
    SUCCEEDED: true,
    FAILED: true,
    BLOCKED: true,
  } satisfies Record<RepositoryImportStatus, true>,
  preparationStatus: {
    NOT_STARTED: true,
    PENDING_USER_CHOICE: true,
    RUNNING: true,
    COMMITTED: true,
    PULL_REQUEST_OPENED: true,
    FAILED: true,
    BLOCKED: true,
  } satisfies Record<RepositoryPreparationStatus, true>,
  preparationMode: {
    DIRECT_COMMIT: true,
    PULL_REQUEST: true,
  } satisfies Record<RepositoryPreparationMode, true>,
  compatibilityStatus: {
    NOT_SCANNED: true,
    COMPATIBLE: true,
    NEEDS_ADDITIONS: true,
    UNSUPPORTED: true,
    CONFLICTED: true,
  } satisfies Record<RepositoryCompatibilityStatus, true>,
  publishingSetupStatus: {
    NOT_CHECKED: true,
    CHECKING: true,
    READY: true,
    NEEDS_REPAIR: true,
    REPAIRING: true,
    BLOCKED: true,
  } satisfies Record<PublishingSetupStatus, true>,
  publishStatus: {
    NOT_STARTED: true,
    QUEUED: true,
    PROVISIONING: true,
    DEPLOYING: true,
    SUCCEEDED: true,
    FAILED: true,
    DELETED: true,
  } satisfies Record<PublishStatus, true>,
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
  it("exhaustively characterizes the Prisma workflow values at runtime", () => {
    expect(
      Object.fromEntries(
        Object.entries(onboardingWorkflowValues).map(([key, values]) => [
          key,
          Object.keys(values),
        ]),
      ),
    ).toEqual({
      sourceOfTruth: ["PORTAL_MANAGED_REPO", "IMPORTED_REPOSITORY"],
      repositoryStatus: ["PENDING", "READY", "FAILED", "DELETED"],
      repositoryAccessStatus: [
        "NOT_REQUESTED",
        "INVITED",
        "GRANTED",
        "FAILED",
      ],
      importStatus: [
        "NOT_REQUIRED",
        "PENDING",
        "RUNNING",
        "SUCCEEDED",
        "FAILED",
        "BLOCKED",
      ],
      preparationStatus: [
        "NOT_STARTED",
        "PENDING_USER_CHOICE",
        "RUNNING",
        "COMMITTED",
        "PULL_REQUEST_OPENED",
        "FAILED",
        "BLOCKED",
      ],
      preparationMode: ["DIRECT_COMMIT", "PULL_REQUEST"],
      compatibilityStatus: [
        "NOT_SCANNED",
        "COMPATIBLE",
        "NEEDS_ADDITIONS",
        "UNSUPPORTED",
        "CONFLICTED",
      ],
      publishingSetupStatus: [
        "NOT_CHECKED",
        "CHECKING",
        "READY",
        "NEEDS_REPAIR",
        "REPAIRING",
        "BLOCKED",
      ],
      publishStatus: [
        "NOT_STARTED",
        "QUEUED",
        "PROVISIONING",
        "DEPLOYING",
        "SUCCEEDED",
        "FAILED",
        "DELETED",
      ],
    });
  });

  it.each([
    [{ ...generatedReady, repositoryStatus: "PENDING" }, "REPOSITORY_PENDING"],
    [{ ...generatedReady, repositoryStatus: "FAILED" }, "REPOSITORY_FAILED"],
    [generatedReady, "GENERATED_PATH_CHOICE"],
    [{ ...generatedReady, pathChoice: "starter" }, "READY_TO_PUBLISH"],
    [
      {
        ...generatedReady,
        pathChoice: "starter",
        repositoryAccessStatus: "INVITED",
      },
      "READY_TO_PUBLISH",
    ],
    [
      {
        ...generatedReady,
        pathChoice: "starter",
        repositoryAccessStatus: "GRANTED",
      },
      "READY_TO_PUBLISH",
    ],
    [
      { ...generatedReady, pathChoice: "customize" },
      "GITHUB_ACCOUNT_REQUIRED",
    ],
    [
      { ...generatedReady, repositoryAccessStatus: "INVITED" },
      "GENERATED_PATH_CHOICE",
    ],
    [
      { ...generatedReady, repositoryAccessStatus: "GRANTED" },
      "GENERATED_PATH_CHOICE",
    ],
    [
      {
        ...generatedReady,
        pathChoice: "customize",
        repositoryAccessStatus: "INVITED",
      },
      "GITHUB_INVITATION_PENDING",
    ],
    [
      {
        ...generatedReady,
        pathChoice: "customize",
        repositoryAccessStatus: "GRANTED",
      },
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
        imported({
          repositoryAccessStatus: "GRANTED",
          preparationStatus: "FAILED",
          preparationMode: "PULL_REQUEST",
        }),
      ),
    ).toEqual({ kind: "PREPARATION_FAILED", retryMode: "PULL_REQUEST" });
  });

  it("returns an incompatible local upload to Codex repair guidance", () => {
    expect(
      deriveOnboardingState(
        local({
          repositoryAccessStatus: "GRANTED",
          preparationStatus: "PENDING_USER_CHOICE",
          preparationMode: "DIRECT_COMMIT",
          compatibilityStatus: "UNSUPPORTED",
        }),
      ),
    ).toEqual({ kind: "LOCAL_CODE_REPAIR" });
  });

  it("requires actor access again before a failed pull-request retry", () => {
    expect(
      deriveOnboardingState(
        imported({
          preparationStatus: "FAILED",
          preparationMode: "PULL_REQUEST",
          repositoryAccessStatus: "NOT_REQUESTED",
        }),
      ),
    ).toEqual({ kind: "GITHUB_ACCOUNT_REQUIRED", resume: "review" });
  });

  it("prioritizes failed-import recovery over the partial target repository failure", () => {
    expect(
      deriveOnboardingState(
        imported({ importStatus: "FAILED", repositoryStatus: "FAILED" }),
      ),
    ).toEqual({ kind: "IMPORT_FAILED" });
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
