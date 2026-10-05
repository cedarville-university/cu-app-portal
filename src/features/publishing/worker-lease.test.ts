// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { claimPublishAttempt, persistPublishProgress, isPublishAttemptStale } from "./worker-lease";
import type { PublishAttempt } from "@prisma/client";
const tx = vi.hoisted(() => ({ publishAttempt: { findFirst: vi.fn(), updateMany: vi.fn() }, appRequest: { updateMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: { publishAttempt: { updateMany: vi.fn() }, $transaction: vi.fn(async (fn) => fn(tx)) } }));
const attempt = { id: "attempt", status: "RUNNING", workerToken: "old", workerHeartbeatAt: new Date(0), workerLeaseExpiresAt: new Date(0), startedAt: new Date(0), createdAt: new Date(0) } as PublishAttempt;
beforeEach(() => { vi.clearAllMocks(); tx.publishAttempt.findFirst.mockResolvedValue({ id: "attempt" }); tx.publishAttempt.updateMany.mockResolvedValue({ count: 1 }); tx.appRequest.updateMany.mockResolvedValue({ count: 1 }); vi.mocked(prisma.publishAttempt.updateMany).mockResolvedValue({ count: 1 }); });
describe("publish lease fencing", () => {
  it("does not steal an active queued worker lease", async () => {
    expect(await claimPublishAttempt({ ...attempt, status: "QUEUED", workerLeaseExpiresAt: new Date(Date.now() + 60_000) }, true)).toBeNull();
    expect(prisma.publishAttempt.updateMany).not.toHaveBeenCalled();
  });
  it("only claims the exact expired lease snapshot", async () => {
    expect(await claimPublishAttempt(attempt)).toEqual({ attemptId: "attempt", token: expect.any(String) });
    expect(prisma.publishAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workerToken: "old", workerLeaseExpiresAt: new Date(0), workerHeartbeatAt: new Date(0) }) }));
  });
  it("blocks a late worker before updating the app when its lease was replaced", async () => {
    tx.publishAttempt.updateMany.mockResolvedValue({ count: 0 });
    await expect(persistPublishProgress({ attemptId: "attempt", token: "old" }, "app", { status: "SUCCEEDED" }, { publishStatus: "SUCCEEDED" })).rejects.toThrow("no longer owns");
    expect(tx.appRequest.updateMany).not.toHaveBeenCalled();
  });
  it("does not overwrite a newer attempt", async () => {
    tx.publishAttempt.findFirst.mockResolvedValue({ id: "newer" });
    await expect(persistPublishProgress({ attemptId: "attempt", token: "old" }, "app", { status: "SUCCEEDED" }, { publishStatus: "SUCCEEDED" })).rejects.toThrow("no longer owns");
    expect(tx.publishAttempt.updateMany).not.toHaveBeenCalled();
  });
  it("recognizes legacy abandoned attempts without worker lease fields", () => {
    expect(isPublishAttemptStale({ ...attempt, workerLeaseExpiresAt: null })).toBe(true);
    expect(isPublishAttemptStale({ ...attempt, status: "SUCCEEDED" })).toBe(false);
  });
});
