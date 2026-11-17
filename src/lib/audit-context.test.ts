import { describe, expect, it, vi } from "vitest";
import { enrichAuditDetails } from "./audit-context";

function db() {
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ email: "ada@cedarville.edu" }) },
    appRequest: { findUnique: vi.fn().mockResolvedValue({ appName: "Campus Dashboard" }) },
  };
}

describe("enrichAuditDetails", () => {
  it("snapshots portal username and app name without losing event details", async () => {
    const store = db();
    expect(await enrichAuditDetails({ actorUserId: "user-1", appId: "app-1", correlationKey: "key" }, store)).toEqual({ actorUserId: "user-1", appId: "app-1", correlationKey: "key", username: "ada", appName: "Campus Dashboard" });
    expect(store.appRequest.findUnique).toHaveBeenCalledWith({ where: { id: "app-1" }, select: { appName: true } });
  });
  it("resolves sign-in identity by Entra object id", async () => {
    const store = db();
    expect(await enrichAuditDetails({ entraOid: "oid-1" }, store)).toMatchObject({ username: "ada", appName: null });
    expect(store.user.findUnique).toHaveBeenCalledWith({ where: { entraOid: "oid-1" }, select: { email: true } });
  });
  it("preserves supplied snapshots after records are deleted", async () => {
    const store = db();
    expect(await enrichAuditDetails({ actorUserId: "user-1", requestId: "gone", username: "original", appName: "Deleted App" }, store)).toMatchObject({ username: "original", appName: "Deleted App" });
    expect(store.appRequest.findUnique).not.toHaveBeenCalled();
    expect(store.user.findUnique).not.toHaveBeenCalled();
  });
  it("does not invent users or apps for system and account events", async () => {
    const store = db();
    expect(await enrichAuditDetails({}, store)).toEqual({ username: "System", appName: null });
    expect(store.user.findUnique).not.toHaveBeenCalled();
    expect(store.appRequest.findUnique).not.toHaveBeenCalled();
  });
  it("keeps audit writes possible when a context lookup fails", async () => {
    const store = db();
    store.user.findUnique.mockRejectedValue(new Error("unavailable"));
    expect(await enrichAuditDetails({ actorUserId: "user-1", requestId: "app-1" }, store)).toMatchObject({ username: null, appName: "Campus Dashboard" });
  });
});
