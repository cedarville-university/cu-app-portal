import { describe, expect, it, vi } from "vitest";
import {
  persistRepositoryAccessOutcome,
  resolveRepositoryAccessForActor,
} from "./actor-access";

function auditDb(
  event: { event: string; details: unknown } | null = null,
) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ email: "collaborator@cedarville.edu" }) },
    appRequest: { findUnique: vi.fn().mockResolvedValue({ appName: "Campus Dashboard" }) },
    auditLog: {
      findFirst: vi.fn().mockResolvedValue(event),
      create: vi.fn().mockResolvedValue({ id: "audit-123" }),
    },
  };
}

describe("resolveRepositoryAccessForActor", () => {
  it.each([
    ["checking-actor", "actor-name", "REPOSITORY_ACCESS_CONFIRMATION_SUCCEEDED", "GRANTED", "GitHub access is ready for @actor-name."],
    ["checking-actor", "actor-name", "REPOSITORY_ACCESS_CONFIRMATION_FAILED", "FAILED", "GitHub could not confirm repository access for @actor-name. Check the username and try again."],
    [
      "owner-123",
      "owner-name",
      "REPOSITORY_ACCESS_FAILED",
      "FAILED",
      "GitHub could not confirm repository access for @owner-name. Check the username and try again.",
    ],
    [
      "collaborator-123",
      "collaborator-name",
      "REPOSITORY_ACCESS_SUCCEEDED",
      "INVITED",
      "GitHub invited @collaborator-name to this repository.",
    ],
    [
      "admin-123",
      "admin-name",
      "REPOSITORY_ACCESS_SUCCEEDED",
      "GRANTED",
      "GitHub access is ready for @admin-name.",
    ],
  ] as const)(
    "uses the durable %s actor outcome",
    async (actorUserId, githubUsername, event, status, note) => {
      const db = auditDb({
        event,
        details: {
          requestId: "request-123",
          actorUserId,
          githubUsername,
          accessStatus: status,
          safeSummary: note,
        },
      });

      await expect(
        resolveRepositoryAccessForActor(
          {
            requestId: "request-123",
            actorUserId,
            githubUsername,
            legacyStatus: "GRANTED",
            legacyNote: "GitHub access is ready for @another-actor.",
          },
          db,
        ),
      ).resolves.toEqual({ status, note });
    },
  );

  it("does not expose an arbitrary failure payload from audit details", async () => {
    const db = auditDb({
      event: "REPOSITORY_ACCESS_FAILED",
      details: {
        requestId: "request-123",
        actorUserId: "collaborator-123",
        githubUsername: "collaborator-name",
        accessStatus: "FAILED",
        safeSummary: "secret=provider-detail&token=raw-token",
      },
    });

    const result = await resolveRepositoryAccessForActor(
      {
        requestId: "request-123",
        actorUserId: "collaborator-123",
        githubUsername: "collaborator-name",
        legacyStatus: "FAILED",
        legacyNote:
          "GitHub access failed for @collaborator-name: secret=legacy-provider-detail",
      },
      db,
    );

    expect(result.status).toBe("FAILED");
    expect(result.note).not.toMatch(/provider-detail|raw-token|secret=/i);
  });

  it("keeps a sanitized same-username legacy fallback", async () => {
    const db = auditDb(null);

    await expect(
      resolveRepositoryAccessForActor(
        {
          requestId: "request-123",
          actorUserId: "legacy-user",
          githubUsername: "legacy-name",
          legacyStatus: "FAILED",
          legacyNote:
            "GitHub access failed for @legacy-name: secret=legacy-provider-detail",
        },
        db,
      ),
    ).resolves.toEqual({
      status: "FAILED",
      note: "GitHub could not confirm repository access for @legacy-name. Check the username and try again.",
    });
  });

  it("does not borrow another actor's legacy status", async () => {
    const db = auditDb(null);

    await expect(
      resolveRepositoryAccessForActor(
        {
          requestId: "request-123",
          actorUserId: "collaborator-123",
          githubUsername: "collaborator-name",
          legacyStatus: "INVITED",
          legacyNote: "GitHub invited @owner-name to this repository.",
        },
        db,
      ),
    ).resolves.toEqual({ status: "NOT_REQUESTED", note: null });
  });
});

describe("persistRepositoryAccessOutcome", () => {
  it.each(["GRANTED", "INVITED", "FAILED"] as const)("correlates confirmation %s results", async (status) => {
    const db = auditDb();
    await persistRepositoryAccessOutcome({ requestId: "request-123", actorUserId: "actor-123", githubUsername: "actor-name", status, source: "codex-mcp", supportReference: "SUP-123", accessPurpose: "confirmation", correlationKey: "key-123", idempotencyKey: "key-123" }, db);
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: { event: status === "FAILED" ? "REPOSITORY_ACCESS_CONFIRMATION_FAILED" : "REPOSITORY_ACCESS_CONFIRMATION_SUCCEEDED", details: expect.objectContaining({ accessStatus: status, accessPurpose: "confirmation", correlationKey: "key-123", idempotencyKey: "key-123", username: "collaborator", appName: "Campus Dashboard" }) } });
  });

  it("stores an actor-keyed safe outcome without raw provider evidence", async () => {
    const db = auditDb();

    await persistRepositoryAccessOutcome(
      {
        requestId: "request-123",
        actorUserId: "collaborator-123",
        githubUsername: "collaborator-name",
        status: "FAILED",
        supportReference: "SUP-123",
        source: "portal-form",
      },
      db,
    );

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: {
        event: "REPOSITORY_ACCESS_FAILED",
        details: {
          requestId: "request-123",
          actorUserId: "collaborator-123",
          githubUsername: "collaborator-name",
          accessStatus: "FAILED",
          safeSummary:
            "GitHub could not confirm repository access for @collaborator-name. Check the username and try again.",
          supportReference: "SUP-123",
          source: "portal-form",
          username: "collaborator",
          appName: "Campus Dashboard",
        },
      },
    });
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain(
      "provider-detail",
    );
  });
});
