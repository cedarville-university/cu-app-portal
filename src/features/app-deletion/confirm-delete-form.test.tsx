import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDeleteForm } from "./confirm-delete-form";

describe("ConfirmDeleteForm", () => {
  it("shows server action errors inline after confirmation", async () => {
    const action = vi.fn().mockResolvedValue({
      error: "This app does not have a tracked GitHub repository to delete.",
    });

    render(
      <ConfirmDeleteForm action={action} className="form-stack">
        <label>
          <input name="deleteGithub" type="checkbox" />
          Delete GitHub repository
        </label>
        <label>
          <input name="confirmDelete" type="checkbox" />
          I understand that checked items will be permanently deleted.
        </label>
        <button type="submit">Delete Selected Resources</button>
      </ConfirmDeleteForm>,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: /delete github repository/i }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /i understand that checked items will be permanently deleted/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /delete selected resources/i }),
    );
    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "delete" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete App" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This app does not have a tracked GitHub repository to delete.",
      );
    });
  });
});
