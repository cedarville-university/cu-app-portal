import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateNotificationPreferencesAction } from "./actions";

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    notificationPreference: { upsert: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { resolveCurrentUserId } = await import(
  "@/features/app-requests/current-user"
);
const { recordAuditEvent } = await import("@/lib/audit");
const { prisma } = await import("@/lib/db");

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

    await updateNotificationPreferencesAction(formData);

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
});
