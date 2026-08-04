import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicAppsPage from "./page";

vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findMany: vi.fn() },
  },
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

beforeEach(() => {
  vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PublicAppsPage", () => {
  it("lists public apps with name, description, and link", async () => {
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req-1",
        appName: "Campus Dashboard",
        submittedConfig: { description: "Live campus stats." },
        publishUrl: "https://dashboard.example.edu",
        primaryPublishUrl: null,
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);

    render(await PublicAppsPage());

    expect(prisma.appRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isPubliclyListed: true },
      }),
    );

    const appCard = screen
      .getByRole("heading", { name: /campus dashboard/i })
      .closest("li") as HTMLElement;
    expect(appCard).not.toBeNull();
    expect(
      within(appCard).getByText("Live campus stats."),
    ).toBeInTheDocument();
    expect(
      within(appCard).getByRole("link", {
        name: "https://dashboard.example.edu",
      }),
    ).toHaveAttribute("href", "https://dashboard.example.edu");
  });

  it("renders apps without a description or link gracefully", async () => {
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req-2",
        appName: "Intramural Scores",
        submittedConfig: null,
        publishUrl: null,
        primaryPublishUrl: null,
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);

    render(await PublicAppsPage());

    const appCard = screen
      .getByRole("heading", { name: /intramural scores/i })
      .closest("li") as HTMLElement;
    expect(within(appCard).queryByRole("link")).not.toBeInTheDocument();
    expect(within(appCard).getByText(/not published yet/i)).toBeInTheDocument();
  });

  it("shows an empty state when no apps are listed publicly", async () => {
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>,
    );

    render(await PublicAppsPage());

    expect(screen.getByText(/no public apps yet/i)).toBeInTheDocument();
  });
});
