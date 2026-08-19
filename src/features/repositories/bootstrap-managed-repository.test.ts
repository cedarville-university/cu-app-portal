import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapManagedRepository } from "./bootstrap-managed-repository";
import { createGitHubAppClient } from "./github-app";

vi.mock("./github-app", () => ({
  createGitHubAppClient: vi.fn(),
}));

describe("bootstrapManagedRepository", () => {
  beforeEach(() => {
    vi.mocked(createGitHubAppClient).mockReset();
  });

  it("uses a stable request-unique repository name and ownership marker", async () => {
    const createRepository = vi.fn().mockResolvedValue({
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
    });
    vi.mocked(createGitHubAppClient).mockReturnValue({
      createRepository,
    });

    const result = await bootstrapManagedRepository({
      appRequestId: "request-123",
      input: {
        templateSlug: "web-app",
        appName: "Campus Dashboard",
        description: "Shows campus metrics.",
        hostingTarget: "Azure App Service",
      },
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      config: {
        appId: "123",
        privateKey: "key",
        allowedOrgs: ["cedarville-it", "cedarville-apps"],
        defaultOrg: "cedarville-it",
        defaultRepoVisibility: "private",
        installationIdsByOrg: {
          "cedarville-it": "111",
        },
      },
    });

    expect(createRepository).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard-request-123",
      visibility: "private",
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      defaultBranch: "main",
      ownershipMarker: {
        description: "Cedarville App Portal request:request-123",
        path: "app-portal/managed-request.json",
        content:
          '{\n  "schemaVersion": "1.0.0",\n  "appRequestId": "request-123"\n}\n',
      },
    });
    expect(result.owner).toBe("cedarville-it");
    expect(result.url).toContain("github.com/cedarville-it/campus-dashboard");
  });

  it("uses different stable targets for requests with the same app name", async () => {
    const createRepository = vi.fn().mockResolvedValue({
      owner: "cedarville-it",
      name: "campus-dashboard-request-456",
      url: "https://github.com/cedarville-it/campus-dashboard-request-456",
      defaultBranch: "main",
    });
    vi.mocked(createGitHubAppClient).mockReturnValue({ createRepository });
    const input = {
      templateSlug: "web-app",
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service" as const,
    };
    const config = {
      appId: "123",
      privateKey: "key",
      allowedOrgs: ["cedarville-it"],
      defaultOrg: "cedarville-it",
      defaultRepoVisibility: "private" as const,
      installationIdsByOrg: { "cedarville-it": "111" },
    };

    await bootstrapManagedRepository({
      appRequestId: "request-123",
      input,
      files: {},
      config,
    });
    await bootstrapManagedRepository({
      appRequestId: "request-456",
      input,
      files: {},
      config,
    });

    expect(createRepository.mock.calls[0]?.[0].name).toBe(
      "campus-dashboard-request-123",
    );
    expect(createRepository.mock.calls[1]?.[0].name).toBe(
      "campus-dashboard-request-456",
    );
  });

  it("keeps long request ids collision-resistant after bounding the name", async () => {
    const createRepository = vi.fn().mockImplementation(({ name }) =>
      Promise.resolve({
        owner: "cedarville-it",
        name,
        url: `https://github.com/cedarville-it/${name}`,
        defaultBranch: "main",
      }),
    );
    vi.mocked(createGitHubAppClient).mockReturnValue({ createRepository });
    const shared = {
      input: {
        templateSlug: "web-app",
        appName: "Campus Dashboard",
        description: "Shows campus metrics.",
        hostingTarget: "Azure App Service" as const,
      },
      files: {},
      config: {
        appId: "123",
        privateKey: "key",
        allowedOrgs: ["cedarville-it"],
        defaultOrg: "cedarville-it",
        defaultRepoVisibility: "private" as const,
        installationIdsByOrg: { "cedarville-it": "111" },
      },
    };
    const commonPrefix = `request-${"a".repeat(50)}`;

    await bootstrapManagedRepository({
      ...shared,
      appRequestId: `${commonPrefix}-one`,
    });
    await bootstrapManagedRepository({
      ...shared,
      appRequestId: `${commonPrefix}-two`,
    });

    const firstName = createRepository.mock.calls[0]?.[0].name;
    const secondName = createRepository.mock.calls[1]?.[0].name;
    expect(firstName).not.toBe(secondName);
    expect(firstName!.length).toBeLessThanOrEqual(100);
    expect(secondName!.length).toBeLessThanOrEqual(100);
  });

  it("allows retry callers to reuse a repository that GitHub already created", async () => {
    const createRepository = vi.fn().mockResolvedValue({
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
    });
    vi.mocked(createGitHubAppClient).mockReturnValue({
      createRepository,
    });

    await bootstrapManagedRepository({
      appRequestId: "request-123",
      input: {
        templateSlug: "web-app",
        appName: "Campus Dashboard",
        description: "Shows campus metrics.",
        hostingTarget: "Azure App Service",
      },
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      reuseExistingRepository: true,
      config: {
        appId: "123",
        privateKey: "key",
        allowedOrgs: ["cedarville-it"],
        defaultOrg: "cedarville-it",
        defaultRepoVisibility: "private",
        installationIdsByOrg: {
          "cedarville-it": "111",
        },
      },
    });

    expect(createRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "cedarville-it",
        name: "campus-dashboard-request-123",
        reuseIfAlreadyExists: true,
        ownershipMarker: expect.objectContaining({
          description: "Cedarville App Portal request:request-123",
        }),
      }),
    );
  });
});
