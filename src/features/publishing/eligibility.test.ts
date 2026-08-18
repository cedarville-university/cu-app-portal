import { describe, expect, it } from "vitest";
import { canQueuePublish } from "./eligibility";

const generatedPublish = {
  sourceOfTruth: "PORTAL_MANAGED_REPO",
  repositoryStatus: "READY",
  publishingSetupStatus: "NOT_CHECKED",
  publishStatus: "NOT_STARTED",
};

describe("canQueuePublish", () => {
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
