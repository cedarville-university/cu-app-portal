// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { requireAdminUserId } from "./roles";
import { recoverPublishAttempt } from "@/features/publishing/recovery";
import { updatePublishingStateAction } from "./publishing-actions";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./roles", () => ({ requireAdminUserId: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/features/publishing/recovery", () => ({ recoverPublishAttempt: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { appRequest: { findUnique: vi.fn(), updateMany: vi.fn() } } }));
function form(operation: string) { const f = new FormData(); f.set("operation", operation); return f; }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireAdminUserId).mockResolvedValue("admin"); vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({ id: "app", supportReference: "SUP-1", publishStatus: "DEPLOYING", publishAttempts: [{ id: "attempt" }] } as never); });
it("rejects nonadmins before accessing the app", async () => {
  vi.mocked(requireAdminUserId).mockRejectedValue(new Error("Administrator access is required."));
  const result = await updatePublishingStateAction("app", { message: "" }, form("reconcile"));
  expect(result.error).toBe(true); expect(prisma.appRequest.findUnique).not.toHaveBeenCalled();
});
it("routes reconciliation through verified recovery instead of a raw success override", async () => {
  vi.mocked(recoverPublishAttempt).mockResolvedValue("succeeded");
  const result = await updatePublishingStateAction("app", { message: "" }, form("reconcile"));
  expect(result.message).toMatch(/now records.*published/); expect(recoverPublishAttempt).toHaveBeenCalledWith("attempt", { actorUserId: "admin", markFailed: false, reason: undefined });
  expect(prisma.appRequest.updateMany).not.toHaveBeenCalled();
});
it("requires a reason and stopped-worker confirmation for a manual failure", async () => {
  const result = await updatePublishingStateAction("app", { message: "" }, form("fail"));
  expect(result.error).toBe(true); expect(recoverPublishAttempt).not.toHaveBeenCalled();
});
it("rejects changes to setup while publishing is active", async () => {
  const f = form("reset-setup"); f.set("reason", "Portal restarted"); f.set("confirmStopped", "on");
  const result = await updatePublishingStateAction("app", { message: "" }, f);
  expect(result.error).toBe(true); expect(prisma.appRequest.updateMany).not.toHaveBeenCalled();
});
