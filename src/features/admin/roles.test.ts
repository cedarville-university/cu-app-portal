import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureInitialAdminRole,
  getInitialAdminEmails,
  requireAdminUserId,
} from "./roles";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: {
      count: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("admin roles", () => {
  beforeEach(() => {
    vi.stubEnv(
      "PORTAL_INITIAL_ADMIN_EMAILS",
      " Admin@Cedarville.edu, staff@CEDARVILLE.edu ,, ",
    );
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(prisma.userRole.count).mockReset();
    vi.mocked(prisma.userRole.findFirst).mockReset();
    vi.mocked(prisma.userRole.upsert).mockReset();
  });

  it("parses initial admin emails from the environment", () => {
    expect(getInitialAdminEmails()).toEqual([
      "admin@cedarville.edu",
      "staff@cedarville.edu",
    ]);
  });

  it("upserts admin role for configured email idempotently", async () => {
    await ensureInitialAdminRole({
      userId: "user_123",
      email: " STAFF@Cedarville.edu ",
    });

    expect(prisma.userRole.upsert).toHaveBeenCalledWith({
      where: {
        userId_role: {
          userId: "user_123",
          role: "ADMIN",
        },
      },
      update: {},
      create: {
        userId: "user_123",
        role: "ADMIN",
      },
    });
  });

  it("does not upsert admin role for unconfigured users", async () => {
    await ensureInitialAdminRole({
      userId: "user_456",
      email: "faculty@cedarville.edu",
    });

    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("returns the current user id when the user has admin role", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValueOnce("user_123");
    vi.mocked(prisma.userRole.findFirst).mockResolvedValueOnce({
      id: "role_123",
      userId: "user_123",
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(requireAdminUserId()).resolves.toBe("user_123");
  });

  it("throws when the current user does not have admin role", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValueOnce("user_456");
    vi.mocked(prisma.userRole.findFirst).mockResolvedValueOnce(null);

    await expect(requireAdminUserId()).rejects.toThrow(
      "Administrator access is required.",
    );
  });
});
