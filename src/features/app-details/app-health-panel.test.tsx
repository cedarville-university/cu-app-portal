import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHealthPanel } from "./app-health-panel";
vi.mock("@/features/publishing/health-actions", () => ({ checkAppHealthAction: vi.fn() }));
vi.mock("react-dom", async (original) => ({ ...await original<typeof import("react-dom")>(), useFormStatus: () => ({ pending: false }) }));
const app = { id: "app", azureWebAppName: "arkanoid", publishStatus: "FAILED", healthStatus: "HEALTHY", healthCheckedAt: new Date("2026-11-19T12:00:00Z"), healthSummary: null };
describe("AppHealthPanel", () => {
  it("offers an explicit check without retrying publishing and shows current health", () => {
    render(<AppHealthPanel app={app} />);
    expect(screen.getByRole("button", { name: "Check Health" })).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText(/Last checked/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry Publish/ })).not.toBeInTheDocument();
    expect(screen.getByText(/two hours/)).toBeInTheDocument();
  });
  it.each(["DELETED", "NOT_STARTED", "DEPLOYING"])("hides checks for %s apps", (publishStatus) => {
    const { container } = render(<AppHealthPanel app={{ ...app, publishStatus }} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("shows availability warnings and a five-minute cadence", () => {
    render(<AppHealthPanel app={{ ...app, healthStatus: "WARNING", healthSummary: "Health route is missing" }} />);
    expect(screen.getByText("Health route is missing")).toBeInTheDocument();
    expect(screen.getByText(/five minutes/)).toBeInTheDocument();
  });
});
