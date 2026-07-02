import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    notificationPreference: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

const { getCurrentUserIdOrNull } = await import(
  "@/features/app-requests/current-user"
);
const { prisma } = await import("@/lib/db");

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      displayName: "Olivia Owner",
      email: "owner@cedarville.edu",
      githubUsername: "ownerhub",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
  });

  it("renders account settings and notification preferences with default-on values", async () => {
    render(await SettingsPage());

    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByText("Olivia Owner")).toBeInTheDocument();
    expect(screen.getByText("owner@cedarville.edu")).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub username")).toHaveDisplayValue(
      "ownerhub",
    );
    expect(
      screen.getByText("Choose which portal updates are sent to owner@cedarville.edu."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Email notification master switch" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email notifications")).toBeChecked();
    expect(
      screen.getByText(
        "Turns all portal email notifications on or off. When this is off, the category choices below are ignored.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Email categories" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("These only apply when Email notifications is on."),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Collaboration emails (shared apps, collaborator changes, accepted invites)",
      ),
    ).toBeChecked();
    expect(
      screen.getByLabelText(
        "App lifecycle emails (app created, repository ready, app deleted)",
      ),
    ).toBeChecked();
    expect(
      screen.getByLabelText(
        "Publishing emails (publish succeeded or failed, setup needs repair)",
      ),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Save Settings" }),
    ).toBeInTheDocument();
  });
});
