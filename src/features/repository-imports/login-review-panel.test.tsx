import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./login-review-actions", () => ({ confirmLoginReviewAction: vi.fn() }));
vi.mock("./actions", () => ({ prepareExistingAppAction: vi.fn() }));
import { LoginReviewPanel } from "./login-review-panel";
const review = { status: "NEEDS_REVIEW" as const, commitSha: "a".repeat(40), sourcePaths: ["src/auth.ts"], findings: [], evidence: "Code review only" };
afterEach(cleanup);
describe("login review panel", () => {
  it("offers recovery instructions and requires explicit review confirmation", () => {
    render(<LoginReviewPanel appId="app" review={review} prompt="Inspect actual sign-in and test it" />);
    expect(screen.getByRole("region", { name: "Sign-in review" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Codex sign-in review prompt" })).toHaveValue("Inspect actual sign-in and test it");
    expect(screen.getByRole("checkbox")).toBeRequired();
    expect(screen.getByRole("button", { name: "Confirm sign-in review" })).toBeInTheDocument();
  });
  it("does not offer confirmation when source checking is unavailable", () => {
    render(<LoginReviewPanel appId="app" review={{ ...review, status: "UNAVAILABLE", commitSha: null }} prompt="Review app" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/could not check/i)).toBeInTheDocument();
  });
  it("shows a recorded review without certifying live authentication", () => {
    render(<LoginReviewPanel appId="app" review={{ ...review, status: "REVIEWED" }} prompt="Review app" />);
    expect(screen.getByText(/current app code has a recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("offers supported publishing preparation recovery before confirmation", () => {
    render(<LoginReviewPanel appId="app" review={{ ...review, publishingUpdateRequired: true, canRefreshPublishing: true }} prompt="Review app" />);
    expect(screen.getByRole("button", { name: "Review publishing update" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
