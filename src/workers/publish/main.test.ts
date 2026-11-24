// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { runPublishWorker } from "./main";
import { checkDueAppHealth } from "@/features/publishing/app-health";
import { recoverStalePublishes } from "@/features/publishing/recovery";
import { runDurablePublishAttempt } from "@/features/publishing/run-durable-attempt";
import { checkNightlySecurity } from "@/features/security-review/worker";
vi.mock("@/features/security-review/worker", () => ({ checkNightlySecurity: vi.fn(async () => ({ scanned: 0, unchanged: 0, failed: 0 })) }));
vi.mock("@/features/publishing/app-health", () => ({ checkDueAppHealth: vi.fn() }));
vi.mock("@/features/publishing/recovery", () => ({ recoverStalePublishes: vi.fn() }));
vi.mock("@/features/publishing/run-durable-attempt", () => ({ runDurablePublishAttempt: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PUBLISH_WORKER_MODE", "recovery");
  vi.mocked(checkDueAppHealth).mockResolvedValue({ checked: 1 });
  vi.mocked(recoverStalePublishes).mockResolvedValue({});
});
it("runs due health scans in the scheduled recovery job without executing publishes", async () => {
  await runPublishWorker();
  expect(checkDueAppHealth).toHaveBeenCalledOnce();
  expect(recoverStalePublishes).toHaveBeenCalledOnce();
  expect(checkNightlySecurity).toHaveBeenCalledOnce();
  expect(runDurablePublishAttempt).not.toHaveBeenCalled();
});
it("runs health scans even if recovery reports individual failures", async () => {
  vi.mocked(recoverStalePublishes).mockResolvedValue({ errors: 1 });
  await expect(runPublishWorker()).rejects.toThrow("could not be inspected");
  expect(checkDueAppHealth).toHaveBeenCalledOnce();
});
