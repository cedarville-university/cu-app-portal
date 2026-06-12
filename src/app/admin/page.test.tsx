import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./page";
import { prisma } from "@/lib/db";
import { requireAdminUserId } from "@/features/admin/roles";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("@/features/admin/roles", () => ({
  requireAdminUserId: vi.fn(),
}));

vi.mock("@/features/admin/actions", () => ({
  addAppCollaboratorAction: vi.fn(),
  grantAdminRoleAction: vi.fn(),
  reassignAppOwnerAction: vi.fn(),
  removeAdminRoleAction: vi.fn(),
  removeAppCollaboratorAction: vi.fn(),
}));

vi.mock("@/features/app-deletion/actions", () => ({
  deleteAppAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
    appRequest: {
      findMany: vi.fn(),
    },
  },
}));

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
  vi.mocked(requireAdminUserId).mockResolvedValue("admin-user");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminPage", () => {
  it("renders users and apps for admins", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "owner-user",
        email: "owner@cedarville.edu",
        displayName: "Olivia Owner",
        githubUsername: "oliviaowner",
        roles: [],
        _count: {
          appRequests: 1,
          appAccess: 0,
        },
      },
      {
        id: "collaborator-user",
        email: "collab@cedarville.edu",
        displayName: "Cam Collaborator",
        githubUsername: null,
        roles: [{ role: "ADMIN" }],
        _count: {
          appRequests: 0,
          appAccess: 1,
        },
      },
    ] as Awaited<ReturnType<typeof prisma.user.findMany>>);
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "request-123",
        appName: "Student Success Hub",
        userId: "owner-user",
        generationStatus: "SUCCEEDED",
        repositoryStatus: "READY",
        publishStatus: "SUCCEEDED",
        repositoryUrl: "https://github.com/cedarville/student-success-hub",
        publishUrl: "https://student-success.example.edu",
        primaryPublishUrl: null,
        createdAt: new Date("2026-04-23T12:30:00.000Z"),
        user: {
          id: "owner-user",
          displayName: "Olivia Owner",
          email: "owner@cedarville.edu",
        },
        collaborators: [
          {
            id: "access-123",
            userId: "collaborator-user",
            user: {
              id: "collaborator-user",
              displayName: "Cam Collaborator",
              email: "collab@cedarville.edu",
            },
          },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);

    render(await AdminPage());

    expect(requireAdminUserId).toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { level: 1, name: "Admin" }),
    ).toBeInTheDocument();

    expect(screen.getByText("Olivia Owner")).toBeInTheDocument();
    expect(screen.getByText("owner@cedarville.edu")).toBeInTheDocument();
    expect(screen.getByText("@oliviaowner")).toBeInTheDocument();
    expect(screen.getAllByText("Cam Collaborator").length).toBeGreaterThan(0);
    expect(screen.getByText("collab@cedarville.edu")).toBeInTheDocument();

    const appSection = screen.getByRole("region", { name: /apps/i });
    expect(within(appSection).getByText("Student Success Hub")).toBeInTheDocument();
    expect(within(appSection).getByText(/owner:\s*Olivia Owner/i)).toBeInTheDocument();
    expect(within(appSection).getByText("Collaborators")).toBeInTheDocument();
    expect(within(appSection).getByText("Cam Collaborator")).toBeInTheDocument();
    expect(
      within(appSection).getByRole("link", { name: /app details/i }),
    ).toHaveAttribute("href", "/download/request-123");
  });
});
