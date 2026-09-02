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

  it("keeps the launch mark colors and orbit visible without external CSS", () => {
    render(<CuLaunchBrand />);

    const mark = screen.getByTestId("cu-launch-mark");
    expect(mark.querySelector(".cu-launch-brand__triangle")).toHaveAttribute(
      "fill",
      "#fcb716",
    );
    expect(mark.querySelector(".cu-launch-brand__star")).toHaveAttribute(
      "fill",
      "#ffffff",
    );
    expect(mark.querySelector(".cu-launch-brand__orbit")).toHaveAttribute(
      "stroke",
      "#ffffff",
    );
    expect(mark.querySelector(".cu-launch-brand__orbit")).toHaveAttribute(
      "stroke-width",
      "2",
    );
  });
});
