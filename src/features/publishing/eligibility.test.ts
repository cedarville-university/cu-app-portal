import type { PublishStatus, PublishingSetupStatus } from "@prisma/client";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as publishingEligibility from "./eligibility";
import {
  canQueuePublish,
  getPublishEligibility,
  getPublishingSetupRepairEligibility,
  type PublishEligibilityInput,
  type PublishEligibilityReason,
} from "./eligibility";

expectTypeOf<
  PublishEligibilityInput["publishStatus"]
>().toEqualTypeOf<PublishStatus>();
expectTypeOf<
  PublishEligibilityInput["publishingSetupStatus"]
>().toEqualTypeOf<PublishingSetupStatus>();

const generatedPublish = {
  sourceOfTruth: "PORTAL_MANAGED_REPO",
  repositoryStatus: "READY",
  publishingSetupStatus: "NOT_CHECKED",
  publishStatus: "NOT_STARTED",
} satisfies PublishEligibilityInput;

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
  ] satisfies Array<[PublishEligibilityInput, PublishEligibilityReason]>)(
    "explains ineligibility as %s",
    (input, reason) => {
      expect(publishingEligibility).toHaveProperty("getPublishEligibility");
      const options =
        input.publishStatus === "FAILED"
          ? {
              allowedPublishStatuses: ["FAILED"] as const,
              allowFailedSetupRetry: true,
            }
          : { allowedPublishStatuses: ["NOT_STARTED"] as const };

      expect(getPublishEligibility(input, options)).toEqual({
        eligible: false,
        reason,
      });
    },
  );

  it("fails closed for an unknown setup status crossing an external boundary", () => {
    const externalInput = {
      ...generatedPublish,
      publishingSetupStatus: "UNEXPECTED",
    } as unknown as PublishEligibilityInput;

    expect(
      getPublishEligibility(externalInput, {
        allowedPublishStatuses: ["NOT_STARTED"],
      }),
    ).toEqual({
      eligible: false,
      reason: "PUBLISHING_SETUP_NOT_READY",
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
    [
      { ...generatedPublish, publishStatus: "QUEUED" },
      "PUBLISH_STATUS_NOT_ALLOWED",
    ],
    [
      { ...generatedPublish, publishStatus: "PROVISIONING" },
      "PUBLISH_STATUS_NOT_ALLOWED",
    ],
    [
      { ...generatedPublish, publishStatus: "DEPLOYING" },
      "PUBLISH_STATUS_NOT_ALLOWED",
    ],
    [
      { ...generatedPublish, publishStatus: "DELETED" },
      "PUBLISH_STATUS_NOT_ALLOWED",
    ],
    [
      { ...generatedPublish, publishingSetupStatus: "CHECKING" },
      "PUBLISHING_SETUP_IN_PROGRESS",
    ],
    [
      { ...generatedPublish, publishingSetupStatus: "REPAIRING" },
      "PUBLISHING_SETUP_IN_PROGRESS",
    ],
    [
      { ...generatedPublish, publishingSetupStatus: "READY" },
      "PUBLISHING_SETUP_ACTION_NOT_ALLOWED",
    ],
  ] satisfies Array<[PublishEligibilityInput, PublishEligibilityReason]>)(
    "rejects setup repair with the shared %s reason",
    (input, reason) => {
      expect(publishingEligibility).toHaveProperty(
        "getPublishingSetupRepairEligibility",
      );

      expect(getPublishingSetupRepairEligibility(input)).toEqual({
        eligible: false,
        reason,
      });
    },
  );

  it("rejects unknown setup data at the repair runtime boundary", () => {
    const externalInput = {
      ...generatedPublish,
      publishingSetupStatus: "UNEXPECTED",
    } as unknown as PublishEligibilityInput;

    expect(getPublishingSetupRepairEligibility(externalInput)).toEqual({
      eligible: false,
      reason: "PUBLISHING_SETUP_ACTION_NOT_ALLOWED",
    });
  });

  it.each(["NOT_CHECKED", "NEEDS_REPAIR", "BLOCKED"] as const)(
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

  it.each(["NOT_STARTED", "FAILED", "SUCCEEDED"] as const)(
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
    } satisfies PublishEligibilityInput;

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
