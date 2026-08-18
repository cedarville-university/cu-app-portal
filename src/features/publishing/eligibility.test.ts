import { describe, expect, it } from "vitest";
import * as publishingEligibility from "./eligibility";
import { canQueuePublish } from "./eligibility";

const generatedPublish = {
  sourceOfTruth: "PORTAL_MANAGED_REPO",
  repositoryStatus: "READY",
  publishingSetupStatus: "NOT_CHECKED",
  publishStatus: "NOT_STARTED",
};

describe("canQueuePublish", () => {
  it.each([
    [
      { ...generatedPublish, repositoryStatus: "PENDING" },
      "REPOSITORY_NOT_READY",
    ],
    [
      {
        ...generatedPublish,
        sourceOfTruth: "IMPORTED_REPOSITORY",
        preparationStatus: "FAILED",
      },
      "PREPARATION_NOT_COMMITTED",
    ],
    [
      { ...generatedPublish, publishStatus: "QUEUED" },
      "PUBLISH_STATUS_NOT_ALLOWED",
    ],
    [
      {
        ...generatedPublish,
        publishStatus: "FAILED",
        publishingSetupStatus: "REPAIRING",
      },
      "PUBLISHING_SETUP_IN_PROGRESS",
    ],
    [
      {
        ...generatedPublish,
        publishingSetupStatus: "UNEXPECTED",
      },
      "PUBLISHING_SETUP_NOT_READY",
    ],
  ])("explains ineligibility as %s", (input, reason) => {
    expect(publishingEligibility).toHaveProperty("getPublishEligibility");

    const getPublishEligibility = (
      publishingEligibility as typeof publishingEligibility & {
        getPublishEligibility: (
          input: typeof generatedPublish & {
            preparationStatus?: string;
          },
          options: {
            allowedPublishStatuses: string[];
            allowFailedSetupRetry?: boolean;
          },
        ) => { eligible: boolean; reason?: string };
      }
    ).getPublishEligibility;
    const options =
      input.publishStatus === "FAILED"
        ? {
            allowedPublishStatuses: ["FAILED"],
            allowFailedSetupRetry: true,
          }
        : { allowedPublishStatuses: ["NOT_STARTED"] };

    expect(getPublishEligibility(input, options)).toEqual({
      eligible: false,
      reason,
    });
  });

  it("shares setup-repair guards for repository and transient setup state", () => {
    expect(publishingEligibility).toHaveProperty(
      "getPublishingSetupRepairEligibility",
    );

    const getRepairEligibility = (
      publishingEligibility as typeof publishingEligibility & {
        getPublishingSetupRepairEligibility: (input: {
          repositoryStatus: string;
          publishingSetupStatus: string;
        }) => { eligible: boolean; reason?: string };
      }
    ).getPublishingSetupRepairEligibility;

    expect(
      getRepairEligibility({
        repositoryStatus: "FAILED",
        publishingSetupStatus: "NEEDS_REPAIR",
      }),
    ).toEqual({ eligible: false, reason: "REPOSITORY_NOT_READY" });
    expect(
      getRepairEligibility({
        repositoryStatus: "READY",
        publishingSetupStatus: "REPAIRING",
      }),
    ).toEqual({
      eligible: false,
      reason: "PUBLISHING_SETUP_IN_PROGRESS",
    });
  });

  it("allows an initial generated-app publish before setup is checked", () => {
    expect(
      canQueuePublish(generatedPublish, {
        allowedPublishStatuses: ["NOT_STARTED"],
      }),
    ).toBe(true);
  });

  it("allows a details-page republish after a successful publish", () => {
    expect(
      canQueuePublish(
        {
          ...generatedPublish,
          publishingSetupStatus: "READY",
          publishStatus: "SUCCEEDED",
        },
        { allowedPublishStatuses: ["NOT_STARTED", "SUCCEEDED"] },
      ),
    ).toBe(true);
  });

  it("allows a failed retry with repairable setup but not while setup is checking", () => {
    expect(
      canQueuePublish(
        {
          ...generatedPublish,
          publishingSetupStatus: "NEEDS_REPAIR",
          publishStatus: "FAILED",
        },
        { allowedPublishStatuses: ["FAILED"], allowFailedSetupRetry: true },
      ),
    ).toBe(true);
    expect(
      canQueuePublish(
        {
          ...generatedPublish,
          publishingSetupStatus: "CHECKING",
          publishStatus: "FAILED",
        },
        { allowedPublishStatuses: ["FAILED"], allowFailedSetupRetry: true },
      ),
    ).toBe(false);
  });

  it("requires imported preparation to be committed and setup ready", () => {
    const importedPublish = {
      ...generatedPublish,
      sourceOfTruth: "IMPORTED_REPOSITORY",
      preparationStatus: "COMMITTED",
      publishingSetupStatus: "READY",
    };

    expect(
      canQueuePublish(importedPublish, {
        allowedPublishStatuses: ["NOT_STARTED"],
      }),
    ).toBe(true);
    expect(
      canQueuePublish(
        { ...importedPublish, preparationStatus: "PULL_REQUEST_OPENED" },
        { allowedPublishStatuses: ["NOT_STARTED"] },
      ),
    ).toBe(false);
    expect(
      canQueuePublish(
        { ...importedPublish, publishingSetupStatus: "NOT_CHECKED" },
        { allowedPublishStatuses: ["NOT_STARTED"] },
      ),
    ).toBe(false);
  });
});
