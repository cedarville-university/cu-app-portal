export const AZURE_DEPLOY_WORKFLOW_PATH =
  ".github/workflows/deploy-azure-app-service.yml";

type WorkflowPatchResult = {
  content: string;
  changed: boolean;
};

export function assertPortalManagedAzureWorkflow(workflow: string) {
  if (
    !workflow.includes("name: Deploy to Azure App Service") ||
    !workflow.includes("azure/webapps-deploy@v3") ||
    !workflow.includes("AZURE_WEBAPP_NAME: ${{ secrets.AZURE_WEBAPP_NAME }}")
  ) {
    throw new Error(
      "Deployment workflow is not a recognized portal-managed Azure workflow.",
    );
  }
}

export function enablePushTriggerForAzureWorkflow(
  workflow: string,
  defaultBranch: string,
): WorkflowPatchResult {
  assertPortalManagedAzureWorkflow(workflow);

  const document = parseDocument(workflow);
  const triggers = document.get("on");
  if (document.errors.length || !isMap(triggers) || !triggers.has("workflow_dispatch")) {
    throw new Error("Deployment workflow does not have the expected manual dispatch trigger.");
  }
  if (triggers.has("push")) {
    return {
      content: workflow,
      changed: false,
    };
  }

  triggers.set("push", { branches: [defaultBranch] });
  return {
    changed: true,
    content: document.toString(),
  };
}
import { isMap, parseDocument } from "yaml";


export function supportsReviewedCommitCheckout(workflow: string, manualOnly = false) {
  try {
    const document = parseDocument(workflow);
    if (document.errors.length) return false;
    const value = document.toJS();
    if (value?.on?.workflow_dispatch?.inputs?.cu_launch_commit_sha?.type !== "string" ||
        (manualOnly && Object.keys(value.on).some(event => event !== "workflow_dispatch"))) return false;
    const steps = value?.jobs?.deploy?.steps;
    if (!Array.isArray(steps)) return false;
    const checkouts = steps.filter(step => typeof step?.uses === "string" && /^actions\/checkout@/.test(step.uses));
    return checkouts.length === 1 && checkouts[0].with?.ref === "${{ inputs.cu_launch_commit_sha || github.sha }}";
  } catch { return false; }
}
