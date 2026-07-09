import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddExistingAppForm } from "./add-existing-app-form";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("./actions", () => ({
  addExistingAppFormAction: vi.fn(),
}));

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
});

afterEach(() => {
  cleanup();
});

describe("AddExistingAppForm", () => {
  it("renders the repository analysis fields", () => {
    render(<AddExistingAppForm />);

    expect(screen.getByLabelText(/github repository url/i)).toHaveAttribute(
      "type",
      "url",
    );
    expect(screen.getByLabelText(/github repository url/i)).toBeRequired();
    expect(screen.getByLabelText(/github repository url/i)).toHaveAttribute(
      "placeholder",
      "https://github.com/owner/repo",
    );
    expect(screen.getByLabelText(/^app name$/i)).toHaveAttribute(
      "type",
      "text",
    );
    expect(screen.getByLabelText(/^app name$/i)).toBeRequired();
    expect(screen.getByLabelText(/^description$/i)).toHaveAttribute(
      "rows",
      "4",
    );
    expect(
      screen.getByRole("button", { name: /check repository/i }),
    ).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders repository lookup failures inline", () => {
    render(
      <AddExistingAppForm
        initialState={{
          error:
            "The portal could not find that repository on GitHub. Double-check the repository URL and make sure the repository is public so the portal can read it.",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The portal could not find that repository on GitHub. Double-check the repository URL and make sure the repository is public so the portal can read it.",
    );
  });
});
