import { isMap, parseDocument } from "yaml";
import { assertPortalManagedAzureWorkflow } from "./workflow-triggers";

type WorkflowPatchResult = { content: string; changed: boolean };

export function disablePushTriggerForAzureWorkflow(
  workflow: string,
): WorkflowPatchResult {
  assertPortalManagedAzureWorkflow(workflow);
  const document = parseDocument(workflow);
  const triggers = document.get("on");
  if (
    document.errors.length ||
    !isMap(triggers) ||
    !triggers.has("workflow_dispatch")
  ) {
    throw new Error("Deployment workflow does not have the expected manual dispatch trigger.");
  }
  if (!triggers.has("push")) return { content: workflow, changed: false };
  triggers.delete("push");
  return { content: document.toString(), changed: true };
}
