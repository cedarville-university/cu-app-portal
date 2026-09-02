import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CuLaunchBrand } from "./cu-launch-brand";

afterEach(cleanup);

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

  it("renders the reference-inspired launch A with a white starburst and navy orbit", () => {
    render(<CuLaunchBrand />);

    const mark = screen.getByTestId("cu-launch-mark");
    expect(mark.querySelector(".cu-launch-brand__left-leg")).toHaveAttribute(
      "fill",
      "#FFB300",
    );
    expect(mark.querySelector(".cu-launch-brand__right-leg")).toHaveAttribute(
      "fill",
      "#FFB300",
    );
    expect(mark.querySelector(".cu-launch-brand__star")).toHaveAttribute(
      "fill",
      "#ffffff",
    );
    expect(mark.querySelector(".cu-launch-brand__orbit")).toHaveAttribute(
      "fill",
      "#0B1D3A",
    );
    expect(mark.querySelector(".cu-launch-brand__star")).toHaveAttribute(
      "d",
      expect.stringContaining("13"),
    );
  });
});
