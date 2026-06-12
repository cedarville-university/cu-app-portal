import { beforeEach, describe, expect, it, vi } from "vitest";
import { appAccessWhere, canDeleteApp, userHasAdminRole } from "./access";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: {
      findFirst: vi.fn(),
    },
    appRequest: {
      findFirst: vi.fn(),
    },
  },
}));

describe("app request access helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a query predicate that allows owner, collaborator, or admin access", () => {
    expect(appAccessWhere("request-123", "user-123", false)).toEqual({
      id: "request-123",
      OR: [
        { userId: "user-123" },
        { collaborators: { some: { userId: "user-123" } } },
      ],
    });

    expect(appAccessWhere("request-123", "admin-123", true)).toEqual({
      id: "request-123",
    });
  });

  it("detects portal admins from UserRole records", async () => {
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
      id: "role-123",
      userId: "user-123",
      role: "ADMIN",
      createdAt: new Date("2026-06-12T12:00:00Z"),
      updatedAt: new Date("2026-06-12T12:00:00Z"),
    } as Awaited<ReturnType<typeof prisma.userRole.findFirst>>);

    await expect(userHasAdminRole("user-123")).resolves.toBe(true);
  });

  it("allows app deletion only for owners or admins", async () => {
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "owner-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(canDeleteApp("owner-123", "request-123")).resolves.toBe(true);
    await expect(canDeleteApp("collaborator-123", "request-123")).resolves.toBe(
      false,
    );

    vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
      id: "role-123",
      userId: "admin-123",
      role: "ADMIN",
      createdAt: new Date("2026-06-12T12:00:00Z"),
      updatedAt: new Date("2026-06-12T12:00:00Z"),
    } as Awaited<ReturnType<typeof prisma.userRole.findFirst>>);

    await expect(canDeleteApp("admin-123", "request-123")).resolves.toBe(true);
  });
});
