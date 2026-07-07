import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auditLogCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: {
      create: auditLogCreateMock,
    },
  },
}));

describe("recordAuditEvent", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    auditLogCreateMock.mockReset();
    vi.restoreAllMocks();
  });

  it("persists the event and details to the audit log table", async () => {
    auditLogCreateMock.mockResolvedValue({ id: "audit-1" });

    const { recordAuditEvent } = await import("./audit");

    await recordAuditEvent("SIGN_IN", {
      provider: "microsoft-entra-id",
      entraOid: "entra-oid",
    });

    expect(auditLogCreateMock).toHaveBeenCalledWith({
      data: {
        event: "SIGN_IN",
        details: {
          provider: "microsoft-entra-id",
          entraOid: "entra-oid",
        },
      },
    });
  });

  it("does not throw when audit persistence fails", async () => {
    auditLogCreateMock.mockRejectedValue(new Error("database unavailable"));

    const { recordAuditEvent } = await import("./audit");

    await expect(
      recordAuditEvent("ADMIN_ROLE_GRANTED", { targetUserId: "user-123" }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("exports the audit event list including USER_PROFILE_UPDATED", async () => {
    const { AUDIT_EVENTS } = await import("./audit");

    expect(AUDIT_EVENTS).toContain("SIGN_IN");
    expect(AUDIT_EVENTS).toContain("ARTIFACT_DOWNLOADED");
    expect(AUDIT_EVENTS).toContain("USER_PROFILE_UPDATED");
    expect(new Set(AUDIT_EVENTS).size).toBe(AUDIT_EVENTS.length);
  });
});
