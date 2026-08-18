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
    ...["QUEUED", "PROVISIONING", "DEPLOYING", "DELETED"].map(
      (publishStatus) => [
        { ...generatedPublish, publishStatus },
        "PUBLISH_STATUS_NOT_ALLOWED",
      ],
    ),
    ...["CHECKING", "REPAIRING"].map((publishingSetupStatus) => [
      { ...generatedPublish, publishingSetupStatus },
      "PUBLISHING_SETUP_IN_PROGRESS",
    ]),
    ...["READY", "UNEXPECTED"].map((publishingSetupStatus) => [
      { ...generatedPublish, publishingSetupStatus },
      "PUBLISHING_SETUP_ACTION_NOT_ALLOWED",
    ]),
  ] as const)(
    "rejects setup repair with the shared %s reason",
    (input, reason) => {
    expect(publishingEligibility).toHaveProperty(
      "getPublishingSetupRepairEligibility",
    );

    const getRepairEligibility = (
      publishingEligibility as typeof publishingEligibility & {
        getPublishingSetupRepairEligibility: (input: {
          sourceOfTruth: string;
          repositoryStatus: string;
          preparationStatus?: string;
          publishingSetupStatus: string;
          publishStatus: string;
        }) => { eligible: boolean; reason?: string };
      }
    ).getPublishingSetupRepairEligibility;

      expect(getRepairEligibility(input)).toEqual({ eligible: false, reason });
    },
  );

  it.each(["NOT_CHECKED", "NEEDS_REPAIR", "BLOCKED"])(
    "allows setup work for exactly the actionable %s setup state",
    (publishingSetupStatus) => {
      expect(
        publishingEligibility.getPublishingSetupRepairEligibility({
          ...generatedPublish,
          publishingSetupStatus,
        }),
      ).toEqual({ eligible: true });
    },
  );

  it.each(["NOT_STARTED", "FAILED", "SUCCEEDED"])(
    "allows setup work in the relevant %s publish relationship",
    (publishStatus) => {
      expect(
        publishingEligibility.getPublishingSetupRepairEligibility({
          ...generatedPublish,
          publishStatus,
          publishingSetupStatus: "NEEDS_REPAIR",
        }),
      ).toEqual({ eligible: true });
    },
  );

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
