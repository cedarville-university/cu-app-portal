// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { checkNightlySecurity } from "./worker";
import { loadGitHubAppConfig } from "../repositories/config";
import { scanDueRepositories } from "./nightly";

vi.mock("../repositories/config", () => ({
  loadGitHubAppConfig: vi.fn(() => ({ allowedOrgs: ["example"] })),
}));
vi.mock("./nightly", async (original) => ({
  ...await original<typeof import("./nightly")>(),
  scanDueRepositories: vi.fn(async () => ({ scanned: 1, unchanged: 0, failed: 0 })),
}));
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.clearAllMocks(); });

it("starts scanning at the configured first nightly boundary", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NIGHTLY_SECURITY_START_AT", "2026-11-25T07:00:00Z");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-25T06:59:59Z"));
  expect(await checkNightlySecurity()).toEqual({ scanned: 0, unchanged: 0, failed: 0 });
  expect(loadGitHubAppConfig).not.toHaveBeenCalled();
  expect(scanDueRepositories).not.toHaveBeenCalled();
  vi.setSystemTime(new Date("2026-11-25T07:00:00Z"));
  expect((await checkNightlySecurity()).scanned).toBe(1);
});

it("rejects an invalid first scan time before accessing repositories", async () => {
  vi.stubEnv("NIGHTLY_SECURITY_START_AT", "invalid");
  await expect(checkNightlySecurity()).rejects.toThrow("07:00 UTC");
  expect(scanDueRepositories).not.toHaveBeenCalled();
});
