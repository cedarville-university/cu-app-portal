import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalActor } from "@/features/portal-api/principal";

const mocks = vi.hoisted(() => ({
  appListWhereForUser: vi.fn(),
  appRequestFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  resolveRepositoryAccessForActor: vi.fn(),
}));

vi.mock("@/features/app-requests/access", () => ({
  appListWhereForUser: mocks.appListWhereForUser,
}));

vi.mock("@/features/repositories/actor-access", () => ({
  resolveRepositoryAccessForActor: mocks.resolveRepositoryAccessForActor,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findMany: mocks.appRequestFindMany },
    user: { findUnique: mocks.userFindUnique },
  },
}));

import { listOwnedAppSummaries } from "./list-owned-apps";

const owner: PortalActor = {
  userId: "owner-1",
  entraOid: "entra-owner-1",
  email: "owner@cedarville.edu",
  displayName: "Owner",
  isAdmin: false,
};

function app(sourceOfTruth: "PORTAL_MANAGED_REPO" | "IMPORTED_REPOSITORY") {
  return {
    id: `${sourceOfTruth}-1`,
    appName: `${sourceOfTruth} app`,
    sourceOfTruth,
    generationStatus: "SUCCEEDED",
    repositoryStatus: "READY",
    repositoryAccessStatus: "NOT_REQUESTED",
    repositoryAccessNote: null,
    repositoryUrl: "https://github.com/cedarville-it/app",
    repositoryDefaultBranch: "main",
    publishStatus: "NOT_STARTED",
    publishingSetupStatus: "NOT_CHECKED",
    publishUrl: null,
    primaryPublishUrl: null,
    supportReference: "SUP-123",
    template: { slug: "web-app", name: "Custom Web App" },
    repositoryImport:
      sourceOfTruth === "IMPORTED_REPOSITORY"
        ? { preparationStatus: "COMMITTED" }
        : null,
    publishAttempts: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appListWhereForUser.mockReturnValue({ OR: [{ userId: "owner-1" }] });
  mocks.userFindUnique.mockResolvedValue({ githubUsername: "owner-name" });
  mocks.resolveRepositoryAccessForActor.mockResolvedValue({
    status: "NOT_REQUESTED",
    note: null,
  });
});

describe("listOwnedAppSummaries", () => {
  it.each([false, true])("only queries owned apps with admin=%s", async (isAdmin) => {
    mocks.appRequestFindMany.mockImplementation(async ({ where }) =>
      where.userId === "owner-1" ? [app("PORTAL_MANAGED_REPO")] :
        [app("PORTAL_MANAGED_REPO"), { ...app("PORTAL_MANAGED_REPO"), id: "foreign-app" }],
    );
    const result = await listOwnedAppSummaries({ ...owner, isAdmin });
    expect(result.map((item) => item.id)).toEqual(["PORTAL_MANAGED_REPO-1"]);
    expect(mocks.appRequestFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "owner-1" } }));
  });
  it("includes owned generated and imported apps but limits imported records to advanced portal management", async () => {
    mocks.appRequestFindMany.mockResolvedValue([
      app("PORTAL_MANAGED_REPO"),
      app("IMPORTED_REPOSITORY"),
    ]);

    await expect(listOwnedAppSummaries(owner)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "PORTAL_MANAGED_REPO-1",
          allowedNextActions: expect.arrayContaining(["publish_app_to_azure"]),
        }),
        expect.objectContaining({
          id: "IMPORTED_REPOSITORY-1",
          allowedNextActions: ["open_portal_for_advanced_management"],
        }),
      ]),
    );
    expect(mocks.appRequestFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "owner-1" } }));
  });
});
