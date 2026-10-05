// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { runDurablePublishAttempt } from "./run-durable-attempt";
import { runPublishAttempt } from "./run-publish-attempt";
import { reconcileClaimedPublish } from "./recovery";
import { claimPublishAttempt, releasePublishClaim } from "./worker-lease";
vi.mock("@/lib/db", () => ({ prisma: { publishAttempt: { findUnique: vi.fn(), findFirst: vi.fn() }, appRequest: { findFirst: vi.fn() } } }));
vi.mock("@/features/app-requests/access", () => ({ appAccessWhere: vi.fn().mockReturnValue({ id: "app" }), userHasAdminRole: vi.fn().mockResolvedValue(false) }));
vi.mock("./run-publish-attempt", () => ({ runPublishAttempt: vi.fn() }));
vi.mock("./recovery", () => ({ reconcileClaimedPublish: vi.fn().mockResolvedValue("succeeded") }));
vi.mock("./worker-lease", () => ({ claimPublishAttempt: vi.fn(), releasePublishClaim: vi.fn(), assertPublishClaim: vi.fn(), renewPublishClaim: vi.fn(), PublishClaimLostError: class extends Error {} }));

const claim = { attemptId: "attempt", token: "worker" };
const attempt = { id: "attempt", appRequestId: "app", actorUserId: "actor", status: "QUEUED", stage: "QUEUED", dispatchStartedAt: null, githubWorkflowRunId: null, appRequest: { publishStatus: "QUEUED" } };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue(attempt as never);
  vi.mocked(prisma.publishAttempt.findFirst).mockResolvedValue({ id: "attempt" } as never);
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({ sourceOfTruth: "PORTAL_MANAGED_REPO" } as never);
  vi.mocked(claimPublishAttempt).mockResolvedValue(claim);
  vi.mocked(runPublishAttempt).mockResolvedValue(undefined);
});
describe("durable publishing worker", () => {
  it("does not execute an attempt owned by another worker", async () => {
    vi.mocked(claimPublishAttempt).mockResolvedValue(null);
    await runDurablePublishAttempt("attempt");
    expect(runPublishAttempt).not.toHaveBeenCalled();
  });
  it("reconciles an interrupted dispatch instead of deploying again", async () => {
    vi.mocked(prisma.publishAttempt.findUnique).mockResolvedValue({ ...attempt, status: "RUNNING", stage: "DEPLOYING", dispatchStartedAt: new Date() } as never);
    await runDurablePublishAttempt("attempt");
    expect(reconcileClaimedPublish).toHaveBeenCalled();
    expect(runPublishAttempt).not.toHaveBeenCalled();
    expect(releasePublishClaim).toHaveBeenCalledWith(claim);
  });
  it("supplies a fresh actor authorization check and fenced claim to the orchestrator", async () => {
    await runDurablePublishAttempt("attempt");
    const [, runtime, authorize, passedClaim] = vi.mocked(runPublishAttempt).mock.calls[0];
    expect(runtime).toBeUndefined();
    expect(passedClaim).toEqual(claim);
    await authorize!();
    expect(prisma.appRequest.findFirst).toHaveBeenCalled();
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);
    await expect(authorize!()).rejects.toThrow("readiness has changed");
  });
  it("propagates an unsettled attempt failure for message redelivery", async () => {
    vi.mocked(runPublishAttempt).mockRejectedValueOnce(new Error("database unavailable"));
    await expect(runDurablePublishAttempt("attempt")).rejects.toThrow("database unavailable");
    expect(releasePublishClaim).toHaveBeenCalledWith(claim);
  });
});
