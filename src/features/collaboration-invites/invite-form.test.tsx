import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollaborationInviteForm } from "./invite-form";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("./actions", () => ({
  sendCollaborationInviteFormAction: vi.fn(),
}));

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
});

afterEach(() => {
  cleanup();
});

describe("CollaborationInviteForm", () => {
  it("renders invite lookup failures inline", () => {
    render(
      <CollaborationInviteForm
        appRequestId="request-123"
        initialState={{
          error: "The portal is unable to look up that email address right now.",
          deliveryStatus: null,
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The portal is unable to look up that email address right now.",
    );
    expect(screen.getByLabelText("Coworker email")).toHaveAttribute(
      "name",
      "email",
    );
    expect(
      screen.getByRole("button", { name: "Send Invite" }),
    ).toBeInTheDocument();
  });

  it("renders delivery feedback inline", () => {
    render(
      <CollaborationInviteForm
        appRequestId="request-123"
        initialState={{ error: null, deliveryStatus: "FAILED" }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The invite was saved, but the email could not be delivered. Try resending it.",
    );
  });
});
