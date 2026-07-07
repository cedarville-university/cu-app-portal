import { describe, expect, it } from "vitest";
import {
  LEGACY_PUBLISH_SKILL_PATH,
  PORTAL_SKILL_PATH,
  buildLegacyPublishToAzureStub,
  buildManagedAppPortalSkill,
} from "./portal-skill";

describe("portal skill generation", () => {
  it("uses stable generated skill paths", () => {
    expect(PORTAL_SKILL_PATH).toBe(".codex/skills/cu-app-portal/SKILL.md");
    expect(LEGACY_PUBLISH_SKILL_PATH).toBe(
      ".codex/skills/publish-to-azure/SKILL.md",
    );
  });

  it("builds a portal-first managed app skill", () => {
    const skill = buildManagedAppPortalSkill();

    expect(skill).toContain("name: cu-app-portal");
    expect(skill).toContain("app-portal/deployment-manifest.json");
    expect(skill).toContain("portal-managed GitHub repository");
    expect(skill).toContain("Prefer the Cedarville App Portal");
    expect(skill).toContain("Repair Publishing Setup");
    expect(skill).toContain("Add Existing App");
    expect(skill).toContain("Do not create unrelated Azure resources");
    expect(skill).toContain("direct Azure CLI publishing as a recovery path");
  });

  it("builds a legacy publish-to-azure stub that redirects to the portal skill", () => {
    const stub = buildLegacyPublishToAzureStub();

    expect(stub).toContain("name: publish-to-azure");
    expect(stub).toContain("Use the `cu-app-portal` skill");
    expect(stub).toContain("portal-managed app");
    expect(stub).toContain("not the default path");
  });
});
