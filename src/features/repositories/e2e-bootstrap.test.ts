import { afterEach, describe, expect, it, vi } from "vitest";
import { getE2EManagedRepositoryBootstrap } from "./e2e-bootstrap";

const input = {
  templateSlug: "public-information-page",
  appName: "Campus Dashboard",
  description: "Shows campus information.",
  hostingTarget: "Azure App Service" as const,
  databaseProvider: "none" as const,
  entraLogin: false,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getE2EManagedRepositoryBootstrap", () => {
  it("returns a deterministic local repository only inside the test bypass", () => {
    vi.stubEnv("E2E_AUTH_BYPASS", "true");
    vi.stubEnv("NODE_ENV", "test");

    expect(
      getE2EManagedRepositoryBootstrap({
        appRequestId: "request-123",
        input,
      }),
    ).toEqual({
      provider: "GITHUB",
      owner: "cedarville-e2e",
      name: "campus-dashboard-request-123",
      url: "https://github.invalid/cedarville-e2e/campus-dashboard-request-123",
      defaultBranch: "main",
      visibility: "private",
    });
  });

  it("cannot substitute repository creation in production", () => {
    vi.stubEnv("E2E_AUTH_BYPASS", "true");
    vi.stubEnv("NODE_ENV", "production");

    expect(
      getE2EManagedRepositoryBootstrap({
        appRequestId: "request-123",
        input,
      }),
    ).toBeNull();
  });
});
