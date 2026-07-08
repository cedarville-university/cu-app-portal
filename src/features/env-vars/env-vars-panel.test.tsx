import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("./actions", () => ({
  saveEnvVarFormAction: vi.fn(),
  deleteEnvVarAction: vi.fn(),
}));

import { EnvVarsPanel } from "./env-vars-panel";

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
});

afterEach(() => {
  cleanup();
});

describe("EnvVarsPanel", () => {
  it("lists variables, masks secret values, and offers deletion", () => {
    render(
      <EnvVarsPanel
        appRequestId="req-1"
        isPublished
        envVars={[
          {
            key: "FEATURE_FLAG",
            isSecret: false,
            value: "on",
            updatedAt: new Date("2026-07-08T12:00:00Z"),
          },
          {
            key: "API_KEY",
            isSecret: true,
            value: null,
            updatedAt: new Date("2026-07-08T12:00:00Z"),
          },
        ]}
      />,
    );

    expect(screen.getByText("Environment Variables")).toBeInTheDocument();
    expect(screen.getByText("FEATURE_FLAG")).toBeInTheDocument();
    expect(screen.getByText("on")).toBeInTheDocument();
    expect(screen.getByText("API_KEY")).toBeInTheDocument();
    expect(screen.getByText("••••••••")).toBeInTheDocument();
    expect(screen.getByText("secret")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete FEATURE_FLAG" }),
    ).toBeInTheDocument();
  });

  it("shows an empty state and pre-publish note when unpublished", () => {
    render(<EnvVarsPanel appRequestId="req-1" isPublished={false} envVars={[]} />);

    expect(screen.getByText("No environment variables yet.")).toBeInTheDocument();
    expect(
      screen.getByText(/applied when the app is published/i),
    ).toBeInTheDocument();
  });

  it("explains the live-restart behavior for published apps", () => {
    render(<EnvVarsPanel appRequestId="req-1" isPublished envVars={[]} />);

    expect(screen.getByText(/briefly restart/i)).toBeInTheDocument();
  });
});
