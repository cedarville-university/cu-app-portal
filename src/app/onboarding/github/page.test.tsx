import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: vi.fn(), findUser: vi.fn(), save: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));
vi.mock("@/features/app-requests/current-user", () => ({ getCurrentUserIdOrNull: mocks.userId }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock("@/features/onboarding/github-profile-actions", () => ({ saveGitHubProfileAction: mocks.save }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import GitHubProfilePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId.mockResolvedValue("actor");
  mocks.findUser.mockResolvedValue({ githubUsername: null });
});
afterEach(cleanup);

describe("post-sign-in GitHub profile step", () => {
  it("asks for a missing username and offers a skip without requiring input", async () => {
    render(await GitHubProfilePage({ searchParams: Promise.resolve({ returnTo: "/create?template=web-app" }) }));
    expect(screen.getByRole("heading", { name: "What's your GitHub username?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "GitHub username" })).toBeRequired();
    expect(screen.getByRole("button", { name: "Save and continue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip for now" })).toHaveAttribute("href", "/create?template=web-app");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("opens GitHub separately and explains how to sign in or create an account and return", async () => {
    render(await GitHubProfilePage({ searchParams: Promise.resolve({}) }));
    const github = screen.getByRole("link", { name: /open github/i });
    expect(github).toHaveAttribute("href", "https://github.com");
    expect(github).toHaveAttribute("target", "_blank");
    expect(github).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/sign in.*create an account/i)).toBeInTheDocument();
    expect(screen.getByText(/return to this tab/i)).toBeInTheDocument();
  });

  it("automatically continues for a saved username without overwriting it", async () => {
    mocks.findUser.mockResolvedValue({ githubUsername: "saved-user" });
    await expect(GitHubProfilePage({ searchParams: Promise.resolve({ returnTo: "/apps" }) })).rejects.toThrow("redirect:/apps");
    expect(mocks.findUser).toHaveBeenCalledWith({ where: { id: "actor" }, select: { githubUsername: true } });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("requires sign-in and preserves the requested destination", async () => {
    mocks.userId.mockResolvedValue(null);
    await expect(GitHubProfilePage({ searchParams: Promise.resolve({ returnTo: "/apps" }) })).rejects.toThrow("redirect:/login?callbackUrl=%2Fapps");
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("keeps Skip for now inside CU Launch even with a tampered destination", async () => {
    render(await GitHubProfilePage({ searchParams: Promise.resolve({ returnTo: "//attacker.invalid" }) }));
    expect(screen.getByRole("link", { name: "Skip for now" })).toHaveAttribute("href", "/");
    const returnTo = document.querySelector('input[name="returnTo"]');
    expect(returnTo).toHaveAttribute("value", "/");
  });
});
