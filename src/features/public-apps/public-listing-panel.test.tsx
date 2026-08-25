import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("./actions", () => ({
  setPublicListingAction: vi.fn(),
}));

import { PublicListingPanel } from "./public-listing-panel";

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PublicListingPanel", () => {
  it("offers to share an unlisted app in the portal", () => {
    render(<PublicListingPanel appRequestId="req-1" isPubliclyListed={false} />);

    expect(screen.getByText(/not shared/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /share in portal/i }),
    ).toBeInTheDocument();
  });

  it("offers to remove a shared app from the portal", () => {
    render(<PublicListingPanel appRequestId="req-1" isPubliclyListed={true} />);

    expect(screen.getByText(/shared in portal/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove from portal sharing/i }),
    ).toBeInTheDocument();
  });
});
