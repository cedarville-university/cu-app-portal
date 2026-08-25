import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppReadinessChecklist } from "./app-readiness-checklist";

describe("AppReadinessChecklist", () => {
  it("summarizes a published Cedarville-only app in plain language", () => {
    render(
      <AppReadinessChecklist
        repositoryReady
        publishingReady
        publishStatus="SUCCEEDED"
        audience="cedarville"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "App readiness" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your app is online.")).toBeInTheDocument();
    expect(
      screen.getByText("Cedarville sign-in is required."),
    ).toBeInTheDocument();
  });

  it("warns when the app was made openly public", () => {
    render(
      <AppReadinessChecklist
        repositoryReady={false}
        publishingReady={false}
        publishStatus="NOT_STARTED"
        audience="public"
      />,
    );

    expect(
      screen.getByText(/anyone who knows or discovers its address can use it/i),
    ).toBeInTheDocument();
  });
});
