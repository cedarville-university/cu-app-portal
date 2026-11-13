import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalActor } from "@/features/portal-api/principal";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn(), update: vi.fn() } }));
const audit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: audit }));
import { getMyProfile, setMyGitHubUsername } from "./service";

const actor: PortalActor = {
  userId: "employee", entraOid: "entra-private", email: "employee@cedarville.edu",
  displayName: "Employee", isAdmin: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  db.user.findUnique.mockResolvedValue({
    displayName: "Current Name", email: "current@cedarville.edu",
    githubUsername: "saved-user", entraOid: "never-return", roles: ["ADMIN"],
  });
  db.user.update.mockImplementation(async ({ data }) => ({ ...data, entraOid: "never-return" }));
});

describe("self-only CU Launch profile", () => {
  it("reads the current actor's fresh saved identity with an explicit safe projection", async () => {
    expect(await getMyProfile(actor)).toEqual({
      displayName: "Current Name", email: "current@cedarville.edu", githubUsername: "saved-user",
    });
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: "employee" },
      select: { displayName: true, email: true, githubUsername: true },
    });
    db.user.findUnique.mockResolvedValueOnce({ displayName: "Current Name", email: "current@cedarville.edu", githubUsername: null });
    expect(await getMyProfile(actor)).toHaveProperty("githubUsername", null);
  });

  it("does not grant administrators a target-user override", async () => {
    await getMyProfile({ ...actor, isAdmin: true });
    await setMyGitHubUsername({ ...actor, isAdmin: true }, "  Cedar-Developer  ");
    expect(db.user.findUnique.mock.calls[0][0].where).toEqual({ id: "employee" });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "employee" }, data: { githubUsername: "cedar-developer" },
      select: { githubUsername: true },
    });
  });

  it("saves only the normalized username and audits the acting identity", async () => {
    expect(await setMyGitHubUsername(actor, "  Cedar-Developer  ")).toEqual({ githubUsername: "cedar-developer" });
    expect(audit).toHaveBeenCalledWith("USER_PROFILE_UPDATED", {
      actorUserId: "employee", githubUsername: "cedar-developer",
      source: "codex-mcp", operation: "set_my_github_username",
    });
  });

  it.each(["", "  ", "@username", "user@example.com", "https://github.com/user", "-username", "username-", "a".repeat(40)])(
    "rejects invalid username %j before any update", async (value) => {
      await expect(setMyGitHubUsername(actor, value)).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(db.user.update).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    },
  );

  it("requires a current portal user record", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(getMyProfile(actor)).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    db.user.update.mockRejectedValue({ code: "P2025" });
    await expect(setMyGitHubUsername(actor, "username")).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    expect(audit).not.toHaveBeenCalled();
  });
});
