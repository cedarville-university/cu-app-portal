import { beforeEach, describe, expect, it, vi } from "vitest";
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { getAdminUserIdOrNull } from "@/features/admin/guard";
import { prisma } from "@/lib/db";
import { getAppPageMetadata } from "./page-metadata";

vi.mock("@/features/app-requests/current-user", () => ({ getCurrentUserIdOrNull: vi.fn() }));
vi.mock("@/features/app-requests/access", () => ({ appAccessWhere: vi.fn(), userHasAdminRole: vi.fn() }));
vi.mock("@/features/admin/guard", () => ({ getAdminUserIdOrNull: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { appRequest: { findFirst: vi.fn() } } }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-1");
  vi.mocked(userHasAdminRole).mockResolvedValue(false);
  vi.mocked(appAccessWhere).mockReturnValue({ id: "app-1", userId: "user-1" });
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({ appName: "Campus Dashboard" } as never);
});

describe("app page titles", () => {
  it.each([
    ["details", "Campus Dashboard"],
    ["setup", "Campus Dashboard · Setup"],
    ["admin", "Campus Dashboard · Admin"],
  ] as const)("uses the app name for %s", async (context, title) => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue("admin-1");
    expect(await getAppPageMetadata("app-1", context)).toEqual({ title });
  });

  it("limits metadata queries to the actor's accessible apps", async () => {
    await getAppPageMetadata("app-1", "details");
    expect(appAccessWhere).toHaveBeenCalledWith("app-1", "user-1", false);
    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith({
      where: { id: "app-1", userId: "user-1" }, select: { appName: true },
    });
  });

  it("uses the administrator guard for admin app titles", async () => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue("admin-1");
    await getAppPageMetadata("app-1", "admin");
    expect(appAccessWhere).toHaveBeenCalledWith("app-1", "admin-1", true);
  });

  it("does not read app names for signed-out users", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue(null);
    expect(await getAppPageMetadata("app-1", "details")).toEqual({ title: "App Details" });
    expect(prisma.appRequest.findFirst).not.toHaveBeenCalled();
  });

  it("does not read admin app names for non-administrators", async () => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue(null);
    expect(await getAppPageMetadata("app-1", "admin")).toEqual({ title: "Admin App" });
    expect(prisma.appRequest.findFirst).not.toHaveBeenCalled();
  });

  it("uses a generic title for missing or inaccessible apps", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);
    expect(await getAppPageMetadata("app-1", "setup")).toEqual({ title: "App Setup" });
  });
});
