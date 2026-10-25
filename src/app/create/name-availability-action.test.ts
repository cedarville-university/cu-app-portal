// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/features/app-requests/current-user", () => ({ resolveCurrentUserId: mocks.authenticate }));
vi.mock("@/lib/db", () => ({ prisma: { appRequest: { findFirst: mocks.findFirst } } }));
import { checkAppNameAvailability } from "./name-availability-action";

describe("name availability", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.authenticate.mockResolvedValue("user-1"); mocks.findFirst.mockResolvedValue(null); });
  it("checks across owners and returns only availability", async () => {
    mocks.findFirst.mockResolvedValue({ id: "private-app" });
    await expect(checkAppNameAvailability(" Campus Hub ")).resolves.toBe(false);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { appName: { equals: "Campus Hub", mode: "insensitive" } }, select: { id: true } });
  });
  it("treats SQL pattern characters as literal name characters", async () => {
    await checkAppNameAvailability("Campus_100%\\name");
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { appName: { equals: "Campus\\_100\\%\\\\name", mode: "insensitive" } }, select: { id: true } });
  });
  it("accepts an unused name", async () => {
    await expect(checkAppNameAvailability("New app")).resolves.toBe(true);
  });
  it("rejects blank names without a lookup", async () => {
    await expect(checkAppNameAvailability("  ")).resolves.toBe(false);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("authenticates before querying names", async () => {
    mocks.authenticate.mockRejectedValue(new Error("Unauthenticated"));
    await expect(checkAppNameAvailability("Campus Hub")).rejects.toThrow("Unauthenticated");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
