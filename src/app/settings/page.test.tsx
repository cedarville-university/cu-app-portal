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
  });

  it("renders notification preferences with default-on values", async () => {
    render(await SettingsPage());

    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email notifications")).toBeChecked();
    expect(screen.getByLabelText("Collaboration emails")).toBeChecked();
    expect(screen.getByLabelText("App lifecycle emails")).toBeChecked();
    expect(screen.getByLabelText("Publishing emails")).toBeChecked();
  });
});
