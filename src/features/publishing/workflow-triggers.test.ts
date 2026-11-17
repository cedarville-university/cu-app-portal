import { describe, expect, it } from "vitest";
import { enablePushTriggerForAzureWorkflow, supportsReviewedCommitCheckout } from "./workflow-triggers";
import { disablePushTriggerForAzureWorkflow } from "./disable-push-trigger";
import { parse } from "yaml";

const manualWorkflow = `name: Deploy to Azure App Service

on:
  workflow_dispatch:

env:
  AZURE_WEBAPP_NAME: \${{ secrets.AZURE_WEBAPP_NAME }}
  DEPLOY_PACKAGE_PATH: release

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v3
`;

describe("enablePushTriggerForAzureWorkflow", () => {
  it("does not accept a comment or unrelated step as pinned checkout support", () => {
    const workflow = manualWorkflow.replace("  workflow_dispatch:\n", "  workflow_dispatch:\n    inputs:\n      cu_launch_commit_sha:\n        type: string\n").replace("    steps:\n", "    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.sha }}\n      # ${{ inputs.cu_launch_commit_sha || github.sha }}\n");
    expect(supportsReviewedCommitCheckout(workflow)).toBe(false);
  });
  it("preserves dispatch inputs when enabling, disabling and enabling push", () => {
    const original = manualWorkflow.replace("  workflow_dispatch:\n", "  workflow_dispatch:\n    inputs:\n      cu_launch_commit_sha:\n        type: string\n        required: false\n");
    const enabled = enablePushTriggerForAzureWorkflow(original, "main");
    const restored = enablePushTriggerForAzureWorkflow(disablePushTriggerForAzureWorkflow(enabled.content).content, "main");
    const triggers = parse(restored.content).on;
    expect(triggers.workflow_dispatch.inputs.cu_launch_commit_sha.type).toBe("string");
    expect(triggers.push).toEqual({ branches: ["main"] });
  });
  it("adds a default-branch push trigger while keeping manual dispatch", () => {
    const result = enablePushTriggerForAzureWorkflow(manualWorkflow, "main");

    expect(result.changed).toBe(true);
    expect(result.content).toContain("on:\n  workflow_dispatch:");
    expect(result.content).toContain("push:\n    branches:\n      - main");
  });

  it("returns unchanged content when a push trigger is already present", () => {
    const workflow = manualWorkflow.replace(
      "on:\n  workflow_dispatch:\n",
      "on:\n  workflow_dispatch:\n  push:\n    branches:\n      - main\n",
    );

    expect(enablePushTriggerForAzureWorkflow(workflow, "main")).toEqual({
      changed: false,
      content: workflow,
    });
  });

  it("refuses unrecognized workflow content", () => {
    expect(() =>
      enablePushTriggerForAzureWorkflow("name: Custom\n", "main"),
    ).toThrow(
      "Deployment workflow is not a recognized portal-managed Azure workflow.",
    );
  });
});

describe("disablePushTriggerForAzureWorkflow", () => {
  it("removes pushes while preserving manual dispatch and other workflow content", () => {
    const workflow = manualWorkflow.replace("  workflow_dispatch:", "  workflow_dispatch:\n  push:\n    branches:\n      - main\n    paths:\n      - src/**\n  schedule:\n    - cron: '0 0 * * *'");
    const result = disablePushTriggerForAzureWorkflow(workflow);
    expect(result.changed).toBe(true);
    expect(result.content).not.toMatch(/^  push:/m);
    expect(result.content).toContain("workflow_dispatch:");
    expect(result.content).toContain("schedule:");
    expect(result.content).toContain("azure/webapps-deploy@v3");
  });

  it("is idempotent for manual-only workflows", () => {
    expect(disablePushTriggerForAzureWorkflow(manualWorkflow)).toEqual({ changed: false, content: manualWorkflow });
  });

  it("refuses unrecognized workflows", () => {
    expect(() => disablePushTriggerForAzureWorkflow("name: Custom\n")).toThrow("not a recognized");
  });
});

it("can restore push deployment after disabling it", () => {
  const enabled = enablePushTriggerForAzureWorkflow(manualWorkflow, "trunk");
  const disabled = disablePushTriggerForAzureWorkflow(enabled.content);
  const restored = enablePushTriggerForAzureWorkflow(disabled.content, "trunk");
  expect(restored.changed).toBe(true);
  expect(restored.content).toContain("push:\n    branches:\n      - trunk");
});
