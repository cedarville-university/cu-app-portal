// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { inspectHealthWorkflow } from "./health-workflow";
import { defaultRecoveryEvidence, type RecoveryAttempt } from "./recovery";
import { createGitHubAppClient } from "@/features/repositories/github-app";
vi.mock("./recovery", () => ({ defaultRecoveryEvidence: { workflow: vi.fn() } }));
vi.mock("@/features/repositories/config", () => ({ loadGitHubAppConfig: () => ({ appId: "1", privateKey: "key", installationIdsByOrg: { org: "2" } }) }));
vi.mock("@/features/repositories/github-app", () => ({ createGitHubAppClient: vi.fn() }));
const latest = vi.fn(), head = vi.fn();
const run = { id: "456", status: "completed", conclusion: "success", headSha: "a".repeat(40), headBranch: "main", path: ".github/workflows/deploy-azure-app-service.yml", createdAt: "2026-11-19T15:00:00Z" };
const attempt = { id: "failed", status: "FAILED", createdAt: new Date("2026-11-19T14:00:00Z"), githubWorkflowRunId: "123", appRequest: { repositoryOwner: "org", repositoryName: "app", repositoryDefaultBranch: "main" } } as RecoveryAttempt;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(defaultRecoveryEvidence.workflow).mockResolvedValue({ status: "completed", conclusion: "cancelled" });
  vi.mocked(createGitHubAppClient).mockReturnValue({ getLatestWorkflowRun: latest, getBranchHead: head } as never);
  latest.mockResolvedValue(run); head.mockResolvedValue({ sha: run.headSha });
});
it("recognizes a later successful deployment of current default-branch code", async () => {
  expect(await inspectHealthWorkflow(attempt)).toMatchObject({ conclusion: "success", replacementRun: { id: "456" } });
  expect(latest).toHaveBeenCalledWith({ owner: "org", name: "app", branch: "main", workflowFileName: "deploy-azure-app-service.yml" });
});
it.each([
  { createdAt: "2026-11-18T14:00:00Z" }, { headBranch: "other" }, { path: ".github/workflows/tests.yml" },
  { status: "in_progress" }, { conclusion: "failure" }, { createdAt: undefined }, { headSha: undefined },
])("does not recover with unrelated or incomplete evidence %j", async (change) => {
  latest.mockResolvedValue({ ...run, ...change });
  expect(await inspectHealthWorkflow(attempt)).not.toHaveProperty("replacementRun");
});
it("rejects a successful run whose commit no longer matches the default branch", async () => {
  head.mockResolvedValue({ sha: "b".repeat(40) });
  expect(await inspectHealthWorkflow(attempt)).not.toHaveProperty("replacementRun");
});
it("keeps a successful rerun of the originally recorded deployment", async () => {
  vi.mocked(defaultRecoveryEvidence.workflow).mockResolvedValue({ status: "completed", conclusion: "success" });
  expect(await inspectHealthWorkflow(attempt)).toEqual({ status: "completed", conclusion: "success" });
  expect(latest).not.toHaveBeenCalled();
});
it("never substitutes a later run for an active portal attempt", async () => {
  await inspectHealthWorkflow({ ...attempt, status: "RUNNING" });
  expect(latest).not.toHaveBeenCalled();
});
