import { describe, expect, it } from "vitest";
import {
  LEGACY_PUBLISH_SKILL_PATH,
  PORTAL_SKILL_PATH,
  buildLegacyPublishToAzureStub,
  buildManagedAppPortalSkill,
  isCanonicalManagedAppPortalSkill,
} from "./portal-skill";
import { buildPreviousManagedAppPortalSkillForTest } from "./portal-skill.test-fixtures";

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
    expect(skill).toContain(
      "may not exist yet during the first upload of a local app",
    );
    expect(skill).toContain("portal-managed GitHub repository");
    expect(skill).toContain("Prefer the Cedarville App Portal");
    expect(skill).toContain("Repair Publishing Setup");
    expect(skill).toContain("Add Existing App");
    expect(skill).toContain("Do not create unrelated Azure resources");
    expect(skill).toContain("direct Azure CLI publishing as a recovery path");
    expect(skill).toContain("load_workspace_dependencies");
    expect(skill).toContain("bundled workspace runtimes");
    expect(skill).toContain("## App Compatibility and Safe Migration");
    expect(skill).toContain("root Next.js");
    expect(skill).toContain("Express");
    expect(skill).toContain("FastAPI");
    expect(skill).toContain("root `index.html`");
    expect(skill).toContain("A root `index.html` alone is not enough");
    expect(skill).toContain(
      "no `package.json`, `requirements.txt`, or `pyproject.toml`",
    );
    expect(skill).toContain(
      "If `package.json` exists but declares neither Next.js nor Express",
    );
    expect(skill).toContain(
      "Do not create `app-portal/http_server_start.py` before the portal prepares the repository",
    );
    expect(skill).toContain("smallest safe migration");
    expect(skill).toContain("preserve the app's user-visible behavior");
    expect(skill).toContain("ask exactly one plain-language question");
    expect(skill).toContain("Do not upload a migration whose relevant tests fail");
    expect(skill).toContain(
      "Never use Browser, Computer Use, Chrome, plugins, or connectors to open or operate the Cedarville App Portal",
    );
    expect(skill).toContain("Portal navigation and button clicks belong to the user");
    expect(skill).not.toContain(
      "Return to the portal for scan, publishing setup, repair, and publish actions",
    );
  });

  it("builds a legacy publish-to-azure stub that redirects to the portal skill", () => {
    const stub = buildLegacyPublishToAzureStub();

    expect(stub).toContain("name: publish-to-azure");
    expect(stub).toContain("Use the `cu-app-portal` skill");
    expect(stub).toContain("portal-managed app");
    expect(stub).toContain("not the default path");
    expect(stub).toContain(
      "Do not open or operate the Cedarville App Portal",
    );
  });

  it("recognizes the immediately previous generated skill but not a customized copy", () => {
    const previousSkill = buildPreviousManagedAppPortalSkillForTest();

    expect(isCanonicalManagedAppPortalSkill(previousSkill)).toBe(true);
    expect(
      isCanonicalManagedAppPortalSkill(`${previousSkill}\nCustomized locally.\n`),
    ).toBe(false);
  });
});
