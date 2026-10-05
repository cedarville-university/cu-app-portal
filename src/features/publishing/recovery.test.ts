// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recoverPublishAttempt, reconcileClaimedPublish, type RecoveryAttempt, type RecoveryEvidence } from "./recovery";
import { prisma } from "@/lib/db";
import { persistPublishProgress } from "./worker-lease";
vi.mock("@/lib/db", () => ({ prisma: {
  publishAttempt: { findUnique: vi.fn(), findFirst: vi.fn() },
  appRequest: { updateMany: vi.fn() },
  $transaction: vi.fn(),
} }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("./worker-lease", () => ({ persistPublishProgress: vi.fn().mockResolvedValue(undefined), claimPublishAttempt: vi.fn(), releasePublishClaim: vi.fn() }));

const claim = { attemptId: "attempt", token: "lease" };
const attempt = {
  id: "attempt", githubWorkflowRunId: "123", status: "RUNNING", stage: "VERIFYING",
  startedAt: new Date("2026-01-01"), createdAt: new Date("2026-01-01"),
  appRequest: { id: "app", supportReference: "SUP-1", primaryPublishUrl: "https://app.azurewebsites.net", publishUrl: null },
} as unknown as RecoveryAttempt;
let evidence: RecoveryEvidence;
beforeEach(() => { vi.clearAllMocks(); evidence = { workflow: vi.fn().mockResolvedValue({ status: "completed", conclusion: "success" }), health: vi.fn().mockResolvedValue({ verifiedAt: new Date() }) }; });

describe("interrupted publishing recovery", () => {
  it("repairs a completed attempt whose app record was stranded by an older worker", async () => {
    const settled = { ...attempt, status: "SUCCEEDED", finishedAt: new Date("2026-01-01"), appRequestId: "app", appRequest: { ...attempt.appRequest, publishStatus: "DEPLOYING", updatedAt: new Date("2026-01-01") } } as RecoveryAttempt;
    vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue(settled);
    vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue({ id: "attempt", status: "SUCCEEDED" } as never);
    vi.mocked(prisma.appRequest.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => (callback as (tx: unknown) => Promise<unknown>)(prisma) as never);
    expect(await recoverPublishAttempt("attempt", {}, evidence)).toBe("succeeded");
    expect(evidence.workflow).toHaveBeenCalledWith(settled);
    expect(evidence.health).toHaveBeenCalled();
    expect(prisma.appRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "app", publishStatus: "DEPLOYING", updatedAt: settled.appRequest.updatedAt },
      data: expect.objectContaining({ publishStatus: "SUCCEEDED", lastPublishedAt: settled.finishedAt }),
    }));
  });
  it("requires a successful recorded workflow and current healthy URL before completing both records", async () => {
    expect(await reconcileClaimedPublish(attempt, claim, {}, evidence)).toBe("succeeded");
    expect(evidence.health).toHaveBeenCalledWith("https://app.azurewebsites.net");
    expect(persistPublishProgress).toHaveBeenCalledWith(claim, "app", expect.objectContaining({ status: "SUCCEEDED", stage: "COMPLETED", verifiedAt: expect.any(Date) }), expect.objectContaining({ publishStatus: "SUCCEEDED", publishingSetupStatus: "READY" }));
  });
  it("does not treat an existing healthy deployment as success for a still-running workflow", async () => {
    vi.mocked(evidence.workflow).mockResolvedValue({ status: "in_progress", conclusion: null });
    expect(await reconcileClaimedPublish(attempt, claim, { markFailed: true }, evidence)).toBe("waiting");
    expect(evidence.health).not.toHaveBeenCalled();
    expect(persistPublishProgress).not.toHaveBeenCalled();
  });
  it("requires administrator review when a dispatch has no recorded run", async () => {
    expect(await reconcileClaimedPublish({ ...attempt, githubWorkflowRunId: null }, claim, {}, evidence)).toBe("review");
    expect(persistPublishProgress).not.toHaveBeenCalled();
  });
  it("closes an expired attempt with a failed health probe as failed", async () => {
    vi.mocked(evidence.health).mockRejectedValue(new Error("unhealthy"));
    expect(await reconcileClaimedPublish(attempt, claim, {}, evidence)).toBe("failed");
    expect(persistPublishProgress).toHaveBeenCalledWith(claim, "app", expect.objectContaining({ status: "FAILED" }), expect.objectContaining({ publishStatus: "FAILED" }));
  });
  it("does not rewrite a successful health check as failure when database persistence fails", async () => {
    vi.mocked(persistPublishProgress).mockRejectedValueOnce(new Error("database down"));
    await expect(reconcileClaimedPublish(attempt, claim, {}, evidence)).rejects.toThrow("database down");
    expect(persistPublishProgress).toHaveBeenCalledTimes(1);
  });
  it("leaves a recent deployment time to finish startup", async () => {
    vi.mocked(evidence.health).mockRejectedValue(new Error("warming up"));
    expect(await reconcileClaimedPublish({ ...attempt, startedAt: new Date() }, claim, {}, evidence)).toBe("waiting");
    expect(persistPublishProgress).not.toHaveBeenCalled();
  });
});
