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
  it("offers to list an unlisted app publicly", () => {
    render(<PublicListingPanel appRequestId="req-1" isPubliclyListed={false} />);

    expect(screen.getByText(/not listed/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /list on public apps/i }),
    ).toBeInTheDocument();
  });

  it("offers to remove a listed app from the public list", () => {
    render(<PublicListingPanel appRequestId="req-1" isPubliclyListed={true} />);

    expect(screen.getByText(/listed publicly/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove from public apps/i }),
    ).toBeInTheDocument();
  });
});
