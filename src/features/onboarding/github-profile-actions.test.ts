import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: vi.fn(), update: vi.fn(), audit: vi.fn(), revalidate: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));
vi.mock("@/features/app-requests/current-user", () => ({ getCurrentUserIdOrNull: mocks.userId }));
vi.mock("@/lib/db", () => ({ prisma: { user: { update: mocks.update } } }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { saveGitHubProfileAction } from "./github-profile-actions";

const initial = { error: null, username: "" };
function input(username: string, returnTo = "/create") {
  const form = new FormData();
  form.set("githubUsername", username);
  form.set("returnTo", returnTo);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId.mockResolvedValue("actor");
  mocks.update.mockResolvedValue({});
  mocks.audit.mockResolvedValue(undefined);
});

describe("UI GitHub profile save", () => {
  it("saves only the signed-in user's normalized username then resumes the original page", async () => {
    const form = input("  Cedar-Developer  ", "/apps/add?source=local");
    form.set("userId", "another-user");
    await expect(saveGitHubProfileAction(initial, form)).rejects.toThrow("redirect:/apps/add?source=local");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "actor" }, data: { githubUsername: "cedar-developer" } });
    expect(mocks.audit).toHaveBeenCalledWith("USER_PROFILE_UPDATED", { actorUserId: "actor", githubUsername: "cedar-developer", source: "portal-ui", operation: "save_github_profile" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/settings");
  });

  it.each(["", "-bad-name", "name@example.com", "https://github.com/name", "a".repeat(40)])("keeps invalid input %j visible without writing or redirecting", async (username) => {
    const result = await saveGitHubProfileAction(initial, input(username));
    expect(result.error).toBeTruthy();
    expect(result.username).toBe(username);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("requires sign-in before validating or saving a submitted profile", async () => {
    mocks.userId.mockResolvedValue(null);
    await expect(saveGitHubProfileAction(initial, input("someone", "/apps"))).rejects.toThrow("redirect:/login?callbackUrl=%2Fapps");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not redirect outside CU Launch after a valid save", async () => {
    await expect(saveGitHubProfileAction(initial, input("someone", "https://attacker.invalid"))).rejects.toThrow("redirect:/");
  });

  it("returns a recoverable error without exposing database details", async () => {
    mocks.update.mockRejectedValue(new Error("database-password=private"));
    const result = await saveGitHubProfileAction(initial, input("someone"));
    expect(result.error).toMatch(/try again|skip/i);
    expect(result.username).toBe("someone");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not block a saved profile when best-effort audit logging fails", async () => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    await expect(saveGitHubProfileAction(initial, input("someone"))).rejects.toThrow("redirect:/create");
  });
});
