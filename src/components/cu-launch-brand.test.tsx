import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CuLaunchBrand } from "./cu-launch-brand";

describe("CuLaunchBrand", () => {
  it("shows the product name, optional tagline, and decorative mark", () => {
    render(<CuLaunchBrand showTagline />);

    expect(screen.getByText("CU Launch")).toBeVisible();
    expect(screen.getByText("Launch your app. We handle the rest.")).toBeVisible();
    expect(screen.getByTestId("cu-launch-mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
