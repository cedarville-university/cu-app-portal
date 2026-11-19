// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { checkAppHealthAction } from "./health-actions";
import { loadAccessibleAppRequest } from "@/features/app-requests/access";
import { checkAppHealth } from "./app-health";
import { revalidatePath } from "next/cache";
vi.mock("@/features/app-requests/current-user", () => ({ resolveCurrentUserId: vi.fn().mockResolvedValue("actor") }));
vi.mock("@/features/app-requests/access", () => ({ loadAccessibleAppRequest: vi.fn() }));
vi.mock("./app-health", () => ({ checkAppHealth: vi.fn().mockResolvedValue("checked") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); });
it("checks access before probing and refreshes all app views", async () => {
  vi.mocked(loadAccessibleAppRequest).mockResolvedValue({ id: "app" } as never);
  await checkAppHealthAction("app");
  expect(loadAccessibleAppRequest).toHaveBeenCalledWith("app", "actor");
  expect(checkAppHealth).toHaveBeenCalledWith("app", "actor");
  expect(revalidatePath).toHaveBeenCalledWith("/download/app");
  expect(revalidatePath).toHaveBeenCalledWith("/onboarding/app");
  expect(revalidatePath).toHaveBeenCalledWith("/apps");
});
it("rejects inaccessible apps without probing", async () => {
  vi.mocked(loadAccessibleAppRequest).mockResolvedValue(null);
  await expect(checkAppHealthAction("app")).rejects.toThrow("App request not found");
  expect(checkAppHealth).not.toHaveBeenCalled();
});
