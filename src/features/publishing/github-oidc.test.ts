import { describe, expect, it } from "vitest";

import { buildGitHubFederatedCredentialSubject } from "./github-oidc";

const identity = {
  owner: "cu-app-portal-repos",
  ownerId: "280105215",
  repository: "slide-show-inator",
  repositoryId: "1330196457",
};

describe("buildGitHubFederatedCredentialSubject", () => {
  it("builds the legacy subject for an older repository", () => {
    expect(
      buildGitHubFederatedCredentialSubject({
        identity: { ...identity, useImmutableSubject: false },
        branch: "main",
      }),
    ).toBe(
      "repo:cu-app-portal-repos/slide-show-inator:ref:refs/heads/main",
    );
  });

  it("builds the immutable subject for a newer repository", () => {
    expect(
      buildGitHubFederatedCredentialSubject({
        identity: { ...identity, useImmutableSubject: true },
        branch: "main",
      }),
    ).toBe(
      "repo:cu-app-portal-repos@280105215/slide-show-inator@1330196457:ref:refs/heads/main",
    );
  });
});
