import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateNotificationPreferencesAction } from "./actions";

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    notificationPreference: { upsert: vi.fn() },
    user: { update: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { resolveCurrentUserId } = await import(
  "@/features/app-requests/current-user"
);
const { recordAuditEvent } = await import("@/lib/audit");
const { prisma } = await import("@/lib/db");
const { revalidatePath } = await import("next/cache");

describe("updateNotificationPreferencesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
  });

  it("upserts notification preferences for the current user", async () => {
    const formData = new FormData();
    formData.set("emailNotificationsEnabled", "on");
    formData.set("collaborationEmailsEnabled", "on");
    formData.set("appLifecycleEmailsEnabled", "on");
    formData.set("githubUsername", "PortalStaff");

    await updateNotificationPreferencesAction(formData);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-123" },
      data: { githubUsername: "PortalStaff" },
    });
    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: "user-123" },
      update: {
        emailNotificationsEnabled: true,
        collaborationEmailsEnabled: true,
        appLifecycleEmailsEnabled: true,
        publishingEmailsEnabled: false,
      },
      create: {
        userId: "user-123",
        emailNotificationsEnabled: true,
        collaborationEmailsEnabled: true,
        appLifecycleEmailsEnabled: true,
        publishingEmailsEnabled: false,
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "NOTIFICATION_PREFERENCES_UPDATED",
      { actorUserId: "user-123" },
    );
  });

  it("still revalidates settings when audit logging fails", async () => {
    vi.mocked(recordAuditEvent).mockRejectedValueOnce(
      new Error("audit unavailable"),
    );

    const formData = new FormData();
    formData.set("emailNotificationsEnabled", "on");

    await expect(
      updateNotificationPreferencesAction(formData),
    ).resolves.toBeUndefined();

    expect(prisma.notificationPreference.upsert).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("clears the GitHub username when the field is blank", async () => {
    const formData = new FormData();
    formData.set("githubUsername", "   ");

    await updateNotificationPreferencesAction(formData);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-123" },
      data: { githubUsername: null },
    });
  });

  it("rejects invalid GitHub usernames before saving settings", async () => {
    const formData = new FormData();
    formData.set("githubUsername", "-bad-name");

    await expect(updateNotificationPreferencesAction(formData)).rejects.toThrow(
      "Enter a valid GitHub username.",
    );

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
  });
});
