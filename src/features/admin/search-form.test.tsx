import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminSearchForm } from "./search-form";

afterEach(() => {
  cleanup();
});

describe("AdminSearchForm", () => {
  it("renders a GET form with the current search value", () => {
    render(
      <AdminSearchForm
        basePath="/admin/users"
        defaultValue="smith"
        placeholder="Search users"
      />,
    );

    const input = screen.getByPlaceholderText("Search users");

    expect(input).toHaveAttribute("name", "q");
    expect(input).toHaveValue("smith");
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
  });

  it("omits the clear link when no search is active", () => {
    render(
      <AdminSearchForm
        basePath="/admin/users"
        defaultValue={null}
        placeholder="Search users"
      />,
    );

    expect(screen.queryByRole("link", { name: "Clear" })).toBeNull();
  });
});
