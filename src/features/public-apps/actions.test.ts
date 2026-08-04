import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));
vi.mock("@/features/app-requests/access", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/app-requests/access")
  >()),
  userHasAdminRole: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findFirst: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));

import { revalidatePath } from "next/cache";
import { userHasAdminRole } from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { setPublicListingAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveCurrentUserId).mockResolvedValue("user-1");
  vi.mocked(userHasAdminRole).mockResolvedValue(false);
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
    id: "req-1",
  } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
});

describe("setPublicListingAction", () => {
  it("lists the app publicly, audits, and revalidates", async () => {
    await setPublicListingAction("req-1", true, new FormData());

    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "req-1",
          OR: [
            { userId: "user-1" },
            { collaborators: { some: { userId: "user-1" } } },
          ],
        },
      }),
    );
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: { isPubliclyListed: true },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "APP_PUBLIC_LISTING_UPDATED",
      {
        requestId: "req-1",
        isPubliclyListed: true,
        actorUserId: "user-1",
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/download/req-1");
    expect(revalidatePath).toHaveBeenCalledWith("/apps/public");
  });

  it("removes the app from the public list", async () => {
    await setPublicListingAction("req-1", false, new FormData());

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: { isPubliclyListed: false },
    });
  });

  it("rejects apps the user cannot access", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

    await expect(
      setPublicListingAction("req-9", true, new FormData()),
    ).rejects.toThrow("App request not found.");
    expect(prisma.appRequest.update).not.toHaveBeenCalled();
  });
});
