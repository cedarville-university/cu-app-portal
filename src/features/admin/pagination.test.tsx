import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Pagination } from "./pagination";

afterEach(() => {
  cleanup();
});

describe("Pagination", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = render(
      <Pagination page={1} totalCount={10} basePath="/admin/users" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current page and next link preserving params", () => {
    render(
      <Pagination
        page={1}
        totalCount={60}
        basePath="/admin/users"
        params={{ q: "smith" }}
      />,
    );

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();

    const next = screen.getByRole("link", { name: "Next" });

    expect(next).toHaveAttribute("href", "/admin/users?q=smith&page=2");
  });

  it("shows a previous link on later pages", () => {
    render(<Pagination page={3} totalCount={60} basePath="/admin/users" />);

    const previous = screen.getByRole("link", { name: "Previous" });

    expect(previous).toHaveAttribute("href", "/admin/users?page=2");
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
  });
});
