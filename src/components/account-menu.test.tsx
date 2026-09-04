import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./account-menu";

vi.mock("@/features/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Log Out</button>,
}));

afterEach(() => cleanup());

describe("AccountMenu", () => {
  it("closes when focus moves outside the menu", () => {
    render(<AccountMenu userDisplayName="Portal Staff" />);

    const menu = screen.getByText("Portal Staff").closest("details");
    expect(menu).not.toBeNull();

    fireEvent.click(screen.getByText("Portal Staff"));
    expect(menu).toHaveAttribute("open");

    fireEvent.focusIn(document.body);

    expect(menu).not.toHaveAttribute("open");
  });

  it("closes when a menu option is selected", () => {
    render(<AccountMenu userDisplayName="Portal Staff" />);

    const menu = screen.getByText("Portal Staff").closest("details");
    fireEvent.click(screen.getByText("Portal Staff"));

    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));

    expect(menu).not.toHaveAttribute("open");
  });
});
