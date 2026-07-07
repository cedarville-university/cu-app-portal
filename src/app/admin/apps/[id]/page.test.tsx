import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminUserIdOrNull } from "@/features/admin/guard";
import { prisma } from "@/lib/db";
import AdminAppDetailPage from "./page";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("@/features/admin/guard", () => ({
  getAdminUserIdOrNull: vi.fn(),
  AdminNotAuthorized: () => <div>Not Authorized</div>,
}));

vi.mock("@/features/admin/actions", () => ({
  addAppCollaboratorAction: vi.fn(),
  reassignAppOwnerAction: vi.fn(),
  removeAppCollaboratorAction: vi.fn(),
}));

vi.mock("@/features/app-deletion/actions", () => ({
  deleteAppFormAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

function mockAppDetail() {
  vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
    id: "app-1",
    appName: "Campus Dashboard",
    userId: "user-1",
    generationStatus: "SUCCEEDED",
    repositoryStatus: "READY",
    publishStatus: "SUCCEEDED",
    repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
    repositoryOwner: "cedarville-it",
    repositoryName: "campus-dashboard",
    publishUrl: "https://campus-dashboard.azurewebsites.net",
    primaryPublishUrl: null,
    azureWebAppName: "campus-dashboard",
    azureDatabaseName: "campus_dashboard_db",
    createdAt: new Date("2026-02-01T12:00:00"),
    user: {
      id: "user-1",
      displayName: "Ada Admin",
      email: "ada@cedarville.edu",
    },
    collaborators: [
      {
        user: {
          id: "user-2",
          displayName: "Norm Normal",
          email: "norm@cedarville.edu",
        },
      },
    ],
  } as unknown as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>);
  vi.mocked(prisma.user.findMany).mockResolvedValue([
    { id: "user-1", displayName: "Ada Admin", email: "ada@cedarville.edu" },
    { id: "user-2", displayName: "Norm Normal", email: "norm@cedarville.edu" },
    { id: "user-3", displayName: "Cass Collab", email: "cass@cedarville.edu" },
  ] as unknown as Awaited<ReturnType<typeof prisma.user.findMany>>);
}

describe("AdminAppDetailPage", () => {
  beforeEach(() => {
    mockUseFormStatus.mockReturnValue({ pending: false });
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue("admin-1");
    vi.mocked(prisma.appRequest.findUnique).mockReset();
    vi.mocked(prisma.user.findMany).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the not authorized state for non-admins", async () => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue(null);

    render(
      await AdminAppDetailPage({ params: Promise.resolve({ id: "app-1" }) }),
    );

    expect(screen.getByText("Not Authorized")).toBeInTheDocument();
  });

  it("renders a not found state for unknown apps", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    render(
      await AdminAppDetailPage({ params: Promise.resolve({ id: "missing" }) }),
    );

    expect(screen.getByText("App Not Found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Apps" })).toHaveAttribute(
      "href",
      "/admin/apps",
    );
  });

  it("renders status, links, and management forms", async () => {
    mockAppDetail();

    render(
      await AdminAppDetailPage({ params: Promise.resolve({ id: "app-1" }) }),
    );

    expect(
      screen.getByRole("heading", { name: "Campus Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Generation: succeeded")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "App Details" })).toHaveAttribute(
      "href",
      "/download/app-1",
    );
    expect(screen.getByLabelText("Add collaborator")).toBeInTheDocument();
    expect(screen.getByLabelText("Reassign owner")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Norm Normal" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Delete selected resources")).toBeInTheDocument();

    // returnTo points back at the admin apps list
    const returnTo = document.querySelector('input[name="returnTo"]');

    expect(returnTo).toHaveAttribute("value", "/admin/apps");

    // The owner is excluded from the collaborator/owner selects
    const collaboratorSelect = screen.getByLabelText("Add collaborator");

    expect(collaboratorSelect).not.toHaveTextContent("Ada Admin");
    expect(collaboratorSelect).toHaveTextContent("Cass Collab");
  });
});
