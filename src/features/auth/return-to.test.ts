import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGitHubProfileSetupUrl, getSafePortalReturnTo } from "./return-to";

beforeEach(() => vi.stubEnv("AUTH_URL", "https://launch.cedarville.edu"));
afterEach(() => vi.unstubAllEnvs());

describe("post-sign-in destinations", () => {
  it.each(["/", "/apps", "/create?template=web-app", "/invites/token-123", "/apps/add?source=local#details"])("preserves the local destination %s", (value) => {
    expect(getSafePortalReturnTo(value)).toBe(value);
  });

  it("accepts the same-origin absolute callbacks produced by Auth.js", () => {
    expect(getSafePortalReturnTo("https://launch.cedarville.edu/create?template=web-app")).toBe("/create?template=web-app");
  });

  it.each([undefined, ["/apps", "/create"], "https://attacker.invalid/", "//attacker.invalid/", "/\\attacker.invalid/", "/%5cattacker.invalid/", "/%2f%2fattacker.invalid/", "/apps\n", "/login", "/login?callbackUrl=/apps", "/api/auth/signin", "/onboarding/github?returnTo=/apps", "/%6cogin", "javascript:alert(1)"])("rejects unsafe or looping destinations %j", (value) => {
    expect(getSafePortalReturnTo(value)).toBe("/");
  });

  it("routes sign-in through setup while retaining app and invitation links", () => {
    expect(getGitHubProfileSetupUrl("/apps/add?source=local")).toBe("/onboarding/github?returnTo=%2Fapps%2Fadd%3Fsource%3Dlocal");
    expect(getGitHubProfileSetupUrl("/invites/token-123")).toBe("/onboarding/github?returnTo=%2Finvites%2Ftoken-123");
    expect(getGitHubProfileSetupUrl("https://attacker.invalid")).toBe("/onboarding/github?returnTo=%2F");
  });

  it("does not nest setup redirects when signing in to the setup page itself", () => {
    const first = getGitHubProfileSetupUrl("/apps");
    expect(getGitHubProfileSetupUrl(first)).toBe(first);
    expect(getGitHubProfileSetupUrl(`https://launch.cedarville.edu${first}`)).toBe(first);
    expect(getGitHubProfileSetupUrl("/onboarding/github?returnTo=https%3A%2F%2Fattacker.invalid")).toBe("/onboarding/github?returnTo=%2F");
  });
});
