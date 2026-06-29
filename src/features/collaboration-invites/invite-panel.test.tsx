import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollaborationInvitePanel } from "./invite-panel";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("./actions", () => ({
  resendCollaborationInviteAction: vi.fn(),
  revokeCollaborationInviteAction: vi.fn(),
  sendCollaborationInviteAction: vi.fn(),
}));

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
});

afterEach(() => {
  cleanup();
});

describe("CollaborationInvitePanel", () => {
  it("renders invite controls and pending invites", () => {
    render(
      <CollaborationInvitePanel
        appRequestId="request-123"
        pendingInvites={[
          {
            id: "invite-123",
            invitedEmail: "staff@cedarville.edu",
            invitedDisplayName: "Staff Member",
            status: "PENDING",
            expiresAt: new Date("2026-07-13T12:00:00.000Z"),
            lastSentAt: new Date("2026-06-29T12:00:00.000Z"),
            inviter: {
              displayName: "Olivia Owner",
              email: "owner@cedarville.edu",
            },
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Coworker email")).toHaveAttribute(
      "name",
      "email",
    );
    expect(
      screen.getByRole("button", { name: "Send Invite" }),
    ).toBeInTheDocument();
    expect(screen.getByText("staff@cedarville.edu")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resend" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revoke" }),
    ).toBeInTheDocument();
  });
});
