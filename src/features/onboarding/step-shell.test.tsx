import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OnboardingStepShell } from "./step-shell";

describe("OnboardingStepShell", () => {
  afterEach(cleanup);

  it("explains the current step and presents the next primary action", () => {
    render(
      <OnboardingStepShell
        appName="Campus Dashboard"
        currentStage="Code"
        title="Your code has a safe home"
        explanation="The portal created a private GitHub repository for your app."
        next="Next, choose whether to publish the starter or customize it first."
        supportReference="SUP-20260818-ABC123"
      >
        <button>Continue</button>
      </OnboardingStepShell>,
    );

    expect(
      screen.getByRole("heading", { name: /your code has a safe home/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the portal created a private github repository/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/what happens next/i)).toBeInTheDocument();
    expect(
      screen.getByText(/technical details for support/i).closest("details"),
    ).not.toHaveAttribute("open");
    expect(
      screen.getByText("SUP-20260818-ABC123"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });

  it("marks the current stage and gives an honest step count", () => {
    render(
      <OnboardingStepShell
        appName="Campus Dashboard"
        currentStage="Prepare"
        title="Your app is getting ready"
        explanation="We are checking the files needed to share your app."
        next="Next, you can publish your app when the check is complete."
      >
        <button>Keep going</button>
      </OnboardingStepShell>,
    );

    const progress = screen.getByRole("list", { name: /app setup progress/i });
    expect(within(progress).getAllByRole("listitem")).toHaveLength(4);
    expect(within(progress).getByText("Prepare")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
  });

  it("renders optional contextual help without making it the main action", () => {
    render(
      <OnboardingStepShell
        appName="Campus Dashboard"
        currentStage="Start"
        title="Let’s get started"
        explanation="Choose how you want to begin your app."
        next="Next, the portal will guide you through the first setup step."
        details={<p>Not sure which option fits? Ask your department’s technology contact.</p>}
      >
        <button>Choose how to start</button>
      </OnboardingStepShell>,
    );

    expect(
      screen.getByText(/not sure which option fits/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose how to start/i })).toBeInTheDocument();
  });
});
