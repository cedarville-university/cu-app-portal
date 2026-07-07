import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  collectAuditReferenceIds,
  resolveAuditReferences,
} from "./audit-log-references";

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

describe("collectAuditReferenceIds", () => {
  it("collects user and app ids from mixed payloads", () => {
    const result = collectAuditReferenceIds([
      { actorUserId: "user-1", appRequestId: "app-1" },
      { targetUserId: "user-2", requestId: "app-2" },
    ]);

    expect(result.userIds).toEqual(["user-1", "user-2"]);
    expect(result.appRequestIds).toEqual(["app-1", "app-2"]);
  });

  it("de-duplicates ids across payloads and within a payload", () => {
    const result = collectAuditReferenceIds([
      { actorUserId: "user-1", targetUserId: "user-1" },
      { userId: "user-1" },
      { appRequestId: "app-1" },
      { requestId: "app-1" },
    ]);

    expect(result.userIds).toEqual(["user-1"]);
    expect(result.appRequestIds).toEqual(["app-1"]);
  });

  it("skips non-object, null, and array payloads", () => {
    const result = collectAuditReferenceIds([
      null,
      undefined,
      "text",
      42,
      ["a", "b"],
      { actorUserId: "user-1" },
    ]);

    expect(result.userIds).toEqual(["user-1"]);
    expect(result.appRequestIds).toEqual([]);
  });

  it("ignores non-string values for known keys", () => {
    const result = collectAuditReferenceIds([
      { actorUserId: 123, appRequestId: null, oldOwnerUserId: undefined },
      { newOwnerUserId: "user-9" },
    ]);

    expect(result.userIds).toEqual(["user-9"]);
    expect(result.appRequestIds).toEqual([]);
  });

  it("ignores keys that are not in the known key lists", () => {
    const result = collectAuditReferenceIds([
      { unrelatedKey: "value-1", provider: "microsoft-entra-id" },
    ]);

    expect(result.userIds).toEqual([]);
    expect(result.appRequestIds).toEqual([]);
  });

  it("collects entra oids from sign-in payloads", () => {
    const result = collectAuditReferenceIds([
      { provider: "microsoft-entra-id", entraOid: "oid-1" },
      { entraOid: "oid-1" },
      { entraOid: 42 },
    ]);

    expect(result.entraOids).toEqual(["oid-1"]);
    expect(result.userIds).toEqual([]);
  });

  it("collects all recognized user id keys", () => {
    const result = collectAuditReferenceIds([
      {
        actorUserId: "u1",
        targetUserId: "u2",
        userId: "u3",
        oldOwnerUserId: "u4",
        newOwnerUserId: "u5",
        invitedUserId: "u6",
      },
    ]);

    expect(result.userIds).toEqual(["u1", "u2", "u3", "u4", "u5", "u6"]);
  });
});

describe("resolveAuditReferences", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findMany).mockReset();
    vi.mocked(prisma.appRequest.findMany).mockReset();
  });

  it("resolves entra oids to users keyed by oid", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "user-1",
        entraOid: "oid-1",
        displayName: "Ada Admin",
        email: "ada@cedarville.edu",
      },
    ] as never);

    const result = await resolveAuditReferences([
      { provider: "microsoft-entra-id", entraOid: "oid-1" },
    ]);

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { entraOid: { in: ["oid-1"] } },
      select: { id: true, entraOid: true, displayName: true, email: true },
    });
    expect(result.usersByEntraOid.get("oid-1")).toEqual({
      id: "user-1",
      displayName: "Ada Admin",
      email: "ada@cedarville.edu",
    });
  });

  it("builds maps from resolved users and apps", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "user-1", displayName: "Ada Admin", email: "ada@cedarville.edu" },
    ] as never);
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      { id: "app-1", appName: "Campus Dashboard" },
    ] as never);

    const result = await resolveAuditReferences([
      { actorUserId: "user-1", appRequestId: "app-1" },
    ]);

    expect(result.users.get("user-1")).toEqual({
      displayName: "Ada Admin",
      email: "ada@cedarville.edu",
    });
    expect(result.apps.get("app-1")).toEqual({ appName: "Campus Dashboard" });
  });

  it("skips the user query entirely when there are no user ids", async () => {
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      { id: "app-1", appName: "Campus Dashboard" },
    ] as never);

    const result = await resolveAuditReferences([{ appRequestId: "app-1" }]);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(result.users.size).toBe(0);
  });

  it("skips the app query entirely when there are no app ids", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "user-1", displayName: "Ada Admin", email: "ada@cedarville.edu" },
    ] as never);

    const result = await resolveAuditReferences([{ actorUserId: "user-1" }]);

    expect(prisma.appRequest.findMany).not.toHaveBeenCalled();
    expect(result.apps.size).toBe(0);
  });

  it("does not call prisma at all when there are no ids", async () => {
    const result = await resolveAuditReferences([{ unrelated: "value" }]);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.appRequest.findMany).not.toHaveBeenCalled();
    expect(result.users.size).toBe(0);
    expect(result.apps.size).toBe(0);
  });

  it("leaves unresolved ids absent from the map", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([] as never);

    const result = await resolveAuditReferences([
      { actorUserId: "user-missing", appRequestId: "app-missing" },
    ]);

    expect(result.users.has("user-missing")).toBe(false);
    expect(result.apps.has("app-missing")).toBe(false);
  });
});
