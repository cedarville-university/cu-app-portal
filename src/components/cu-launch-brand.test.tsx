import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CuLaunchBrand } from "./cu-launch-brand";

afterEach(cleanup);

describe("CuLaunchBrand", () => {
  it("shows the product name, optional tagline, and decorative mark", () => {
    render(<CuLaunchBrand showTagline />);

    expect(screen.getByText("CU LAUNCH")).toBeVisible();
    expect(screen.getByText("Launch your app. We handle the rest.")).toBeVisible();
    expect(screen.getByTestId("cu-launch-mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("uses the generated light-surface mark by default", () => {
    render(<CuLaunchBrand />);

    const mark = screen.getByTestId("cu-launch-mark");
    expect(mark).toHaveAttribute("src", "/brand/cu-launch-mark-light.png");
    expect(mark).toHaveAttribute("alt", "");
  });

  it("uses the reversed generated mark on a navy surface", () => {
    render(<CuLaunchBrand surface="dark" />);

    expect(screen.getByTestId("cu-launch-mark")).toHaveAttribute(
      "src",
      "/brand/cu-launch-mark-dark.png",
    );
  });
});
