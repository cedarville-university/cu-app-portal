import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/app-requests/current-user", () => ({ resolveCurrentUserId: vi.fn().mockResolvedValue("owner") }));
vi.mock("@/features/app-requests/access", () => ({ userHasAdminRole: vi.fn().mockResolvedValue(false) }));
vi.mock("./login-review", () => ({ reviewImportedAppLogin: vi.fn().mockResolvedValue({ status: "REVIEWED" }) }));
import { confirmLoginReviewAction } from "./login-review-actions";
import { reviewImportedAppLogin } from "./login-review";
beforeEach(() => vi.clearAllMocks());
describe("portal sign-in review confirmation", () => {
  it("normalizes browser textarea CRLF before checking the reviewed paths", async () => {
    const form = new FormData();
    form.set("commitSha", "a".repeat(40)); form.set("checksConfirmed", "on");
    form.set("sourcePaths", "src/auth.ts\r\n src/app/login/page.tsx \r\n");
    expect(await confirmLoginReviewAction("app", { error: null }, form)).toEqual({ error: null });
    expect(reviewImportedAppLogin).toHaveBeenCalledWith({ userId: "owner", isAdmin: false }, {
      appId: "app", commitSha: "a".repeat(40), sourcePaths: ["src/auth.ts", "src/app/login/page.tsx"], checksConfirmed: true,
    });
  });
});
