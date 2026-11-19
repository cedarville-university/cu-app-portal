import { createGitHubAppClient } from "@/features/repositories/github-app";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { defaultRecoveryEvidence, type RecoveryAttempt } from "./recovery";
import { AZURE_DEPLOY_WORKFLOW_PATH } from "./workflow-triggers";

export type HealthWorkflowEvidence = {
  status: string;
  conclusion: string | null;
  replacementRun?: { id: string; url: string; startedAt: Date };
};

export async function inspectHealthWorkflow(attempt: RecoveryAttempt): Promise<HealthWorkflowEvidence> {
  const recorded = attempt.githubWorkflowRunId
    ? await defaultRecoveryEvidence.workflow(attempt)
    : { status: "unknown", conclusion: null };
  if (attempt.status !== "FAILED" || (recorded.status === "completed" && recorded.conclusion === "success")) return recorded;
  const app = attempt.appRequest;
  const owner = app.repositoryOwner, name = app.repositoryName, branch = app.repositoryDefaultBranch;
  if (!owner || !name || !branch) return recorded;
  const config = loadGitHubAppConfig();
  const installationId = config.installationIdsByOrg[owner];
  if (!installationId) return recorded;
  const github = createGitHubAppClient({
    appId: config.appId, privateKey: config.privateKey, installationId,
    fetchImpl: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  });
  const run = await github.getLatestWorkflowRun({ owner, name, branch, workflowFileName: AZURE_DEPLOY_WORKFLOW_PATH.split("/").pop()! });
  const startedAt = new Date(run.createdAt ?? "");
  // A healthy old deployment or an unrelated workflow is insufficient evidence.
  if (run.id === attempt.githubWorkflowRunId || !/^\d+$/.test(run.id) || run.status !== "completed" || run.conclusion !== "success"
    || run.path !== AZURE_DEPLOY_WORKFLOW_PATH || run.headBranch !== branch || !run.headSha || !/^[a-f0-9]{40}$/i.test(run.headSha)
    || !Number.isFinite(startedAt.getTime()) || startedAt <= (attempt.startedAt ?? attempt.createdAt)) return recorded;
  const head = await github.getBranchHead({ owner, name, branch });
  if (head.sha !== run.headSha) return recorded;
  return { status: "completed", conclusion: "success", replacementRun: {
    id: run.id, url: `https://github.com/${owner}/${name}/actions/runs/${run.id}`, startedAt,
  } };
}
