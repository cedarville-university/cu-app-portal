// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  grantManagedRepositoryAccess,
  revokeManagedRepositoryAccess,
} from "./access";

const addRepositoryCollaborator = vi.fn();
const removeRepositoryCollaborator = vi.fn();

vi.mock("./github-app", () => ({
  createGitHubAppClient: vi.fn(() => ({
    addRepositoryCollaborator,
    removeRepositoryCollaborator,
  })),
}));

vi.mock("./config", () => ({
  loadGitHubAppConfig: vi.fn(() => ({
    appId: "app-1",
    privateKey: "key",
    installationIdsByOrg: { "cedarville-it": "inst-1" },
  })),
}));

describe("managed repository access helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addRepositoryCollaborator.mockResolvedValue({ status: "GRANTED" });
    removeRepositoryCollaborator.mockResolvedValue(undefined);
  });

  it("grantManagedRepositoryAccess adds a collaborator with push permission", async () => {
    await expect(
      grantManagedRepositoryAccess({
        owner: "cedarville-it",
        repositoryName: "campus-dashboard",
        githubUsername: "casey-dev",
      }),
    ).resolves.toEqual({ status: "GRANTED" });

    expect(addRepositoryCollaborator).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      username: "casey-dev",
      permission: "push",
    });
  });

  it("revokeManagedRepositoryAccess removes the collaborator", async () => {
    await expect(
      revokeManagedRepositoryAccess({
        owner: "cedarville-it",
        repositoryName: "campus-dashboard",
        githubUsername: "casey-dev",
      }),
    ).resolves.toBeUndefined();

    expect(removeRepositoryCollaborator).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      username: "casey-dev",
    });
  });
});
