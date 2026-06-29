import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InviteAcceptPage from "./page";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/auth/session", () => ({
  getServerSession: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("@/features/collaboration-invites/actions", () => ({
  acceptCollaborationInviteAction: vi.fn(),
}));

import { getServerSession, signIn } from "@/auth/session";
import { acceptCollaborationInviteAction } from "@/features/collaboration-invites/actions";

beforeEach(() => {
  redirectMock.mockReset();
  vi.mocked(getServerSession).mockReset();
  vi.mocked(signIn).mockReset();
  vi.mocked(acceptCollaborationInviteAction).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("InviteAcceptPage", () => {
  it("renders a sign-in prompt when no user is signed in", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    render(
      await InviteAcceptPage({
        params: Promise.resolve({ token: "token-123" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Accept Collaboration Invite" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sign in to accept this collaboration invite."),
    ).toBeInTheDocument();

    const form = document.querySelector("form");
    expect(form).toBeInTheDocument();
  });

  it("accepts the invite and redirects signed-in users to app details", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user-123",
        email: "staff@cedarville.edu",
      },
    });
    vi.mocked(acceptCollaborationInviteAction).mockResolvedValue("request-123");

    await InviteAcceptPage({
      params: Promise.resolve({ token: "token-123" }),
    });

    expect(acceptCollaborationInviteAction).toHaveBeenCalledWith("token-123");
    expect(acceptCollaborationInviteAction).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/download/request-123");
  });
});
