import { beforeEach, expect, it, vi } from "vitest";
import { applySecurityUpdate } from "./update-action";

const mock = vi.hoisted(() => ({ user: vi.fn(), admin: vi.fn(), find: vi.fn(), apply: vi.fn(), audit: vi.fn() }));
vi.mock("../app-requests/access", () => ({ userHasAdminRole: mock.admin }));
vi.mock("../app-requests/current-user", () => ({ getCurrentUserIdOrNull: mock.user }));
vi.mock("@/lib/db", () => ({ prisma: { appRequest: { findFirst: mock.find } } }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mock.audit }));
vi.mock("./update-service", async () => ({
  ...await vi.importActual<typeof import("./update-service")>("./update-service"), updateClient: () => ({ applyUpdate: mock.apply }),
}));
const head = "a".repeat(40);
const base = "b".repeat(40);
const app = { repositoryName: "testing-bouncer", repositoryOwner: "cu-app-portal-repos", repositoryUrl: "https://github.com/cu-app-portal-repos/testing-bouncer",
  repositoryStatus: "READY", deploymentTriggerMode: "PUSH_TO_DEPLOY" };
beforeEach(() => { vi.resetAllMocks(); mock.user.mockResolvedValue("owner"); mock.admin.mockResolvedValue(false); mock.find.mockResolvedValue(app); mock.apply.mockResolvedValue(true); });
it("binds the actor and app to the approved repository and records a confirmed merge", async () => {
  expect(await applySecurityUpdate("app", 4, head, base)).toMatchObject({ applied: true });
  expect(mock.find.mock.calls[0][0].where).toEqual({ id: "app", userId: "owner" });
  expect(mock.apply).toHaveBeenCalledWith({ owner: "cu-app-portal-repos", name: "testing-bouncer" }, 4, head, base);
  expect(mock.audit).toHaveBeenCalledOnce();
});
it("rejects signed-out, foreign and mismatched repository requests before contacting GitHub", async () => {
  mock.user.mockResolvedValueOnce(null);
  expect((await applySecurityUpdate("app", 4, head, base)).applied).toBe(false);
  expect(mock.find).not.toHaveBeenCalled();
  mock.find.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...app, repositoryUrl: "https://github.com/example/pilot" });
  expect((await applySecurityUpdate("app", 4, head, base)).applied).toBe(false);
  expect((await applySecurityUpdate("app", 4, head, base)).applied).toBe(false);
  expect(mock.apply).not.toHaveBeenCalled();
});
it("does not record a rejected or unconfirmed merge as applied", async () => {
  mock.apply.mockResolvedValueOnce(false).mockRejectedValueOnce(Error());
  expect((await applySecurityUpdate("app", 4, head, base)).applied).toBe(false);
  expect((await applySecurityUpdate("app", 4, head, base)).applied).toBe(false);
  expect(mock.audit).not.toHaveBeenCalled();
});
