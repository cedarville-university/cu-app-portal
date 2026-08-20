import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("README", () => {
  it("documents local setup and key scripts", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("npm run dev");
    expect(readme).toContain("Microsoft Entra ID");
    expect(readme).toContain(
      "add an existing compatible GitHub app repository",
    );
    expect(readme).toContain("review PR");
    expect(readme).toContain("Recommended Templates");
    expect(readme).toContain("Developer Starters");
    expect(readme).toContain("Department Form + Approval");
    expect(readme).toContain("Create New App");
    expect(readme).toContain("Add Existing App");
    expect(readme).toContain("Continue Setup");
    expect(readme).toContain("Manage App");
    expect(readme).toContain("request-unique managed repository name");
    expect(readme).toContain("tracked per signed-in actor");
  });

  it("keeps the quick start aligned with the guided first-publish choices", () => {
    const quickStart = readFileSync("docs/user/quick-start.md", "utf8");

    expect(quickStart).toContain("Publish the starter now");
    expect(quickStart).toContain("Customize it with Codex first");
    expect(quickStart).toContain("Continue Setup");
    expect(quickStart).not.toContain("Create and Publish");
  });

  it("documents generated starter publication as one button, not a second confirmation", () => {
    const sources = [
      readFileSync("docs/user/quick-start.md", "utf8"),
      readFileSync("docs/user/guide.md", "utf8"),
      readFileSync("docs/user/faq.md", "utf8"),
      readFileSync("docs/portal/setup.md", "utf8"),
    ];

    for (const source of sources) {
      expect(source).toContain(
        "**Publish the starter now** starts Azure publishing immediately",
      );
    }

    expect(sources.join("\n")).not.toContain(
      "The app goes online only after you explicitly select **Publish to Azure**",
    );
    expect(sources.join("\n")).not.toContain(
      "Select **Publish to Azure** when you are ready. This is the explicit confirmation",
    );
  });

  it("keeps every novice handoff guide aligned with managed Git and local Codex projects", () => {
    const sources = [
      "docs/user/quick-start.md",
      "docs/user/guide.md",
      "docs/user/troubleshooting.md",
      "docs/user/faq.md",
      "docs/portal/setup.md",
    ].map((path) => readFileSync(path, "utf8"));

    for (const source of sources) {
      expect(source).toContain("Company Portal");
      expect(source).toContain("CedarNet 2.0");
      expect(source).toContain("local Codex project");
      expect(source).toContain("Quick chat");
    }

    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("Company Portal");
    expect(readme).toContain("CedarNet 2.0");
    expect(readme).toContain("local Codex project");
    expect(readme).toContain("Quick chat");

    const glossary = readFileSync("docs/user/glossary.md", "utf8");
    expect(glossary).toContain("\n## Git\n");
    expect(glossary).toContain("\n## Local Codex project\n");
    expect(glossary).toContain("\n## Primary folder\n");
    expect(glossary).toContain("\n## Quick chat\n");
  });
});

describe("portal setup docs", () => {
  it("packages runtime user documentation for Azure", () => {
    const workflow = readFileSync(
      ".github/workflows/deploy-azure-app-service.yml",
      "utf8",
    );

    expect(workflow).toContain(
      'cp -R docs/user "${{ env.DEPLOY_PACKAGE_PATH }}/docs/user"',
    );
    expect(workflow).toContain(
      'test -f "${{ env.DEPLOY_PACKAGE_PATH }}/docs/user/quick-start.md"',
    );
  });

  it("documents portal-managed azure publish runtime settings", () => {
    const setup = readFileSync("docs/portal/setup.md", "utf8");

    expect(setup).toContain("AZURE_PUBLISH_RESOURCE_GROUP");
    expect(setup).toContain("rg-cu-apps-published");
    expect(setup).toContain("AZURE_PUBLISH_RUNTIME_STACK");
    expect(setup).toContain("NODE|24-lts");
  });

  it("documents add existing app setup constraints", () => {
    const setup = readFileSync("docs/portal/setup.md", "utf8");

    expect(setup).toContain("### Add Existing App");
    expect(setup).toContain("same GitHub App configuration");
    expect(setup).toContain("public GitHub access");
    expect(setup).toContain("no user GitHub OAuth");
    expect(setup).toContain("short-lived GitHub App installation token");
    expect(setup).toContain("repository creation permission");
    expect(setup).toContain("GitHub CLI (`gh`) is not required");
    expect(setup).toContain("stable request-unique target name");
    expect(setup).toContain("append-only audit events");
    expect(setup).toContain("atomically claimed before any provider mutation");
    expect(setup).toContain(
      "narrowly scoped local repository-bootstrap substitute",
    );
    expect(setup).toContain(
      "root Next.js apps, Express apps, Python FastAPI apps, and plain static Python `http.server` apps",
    );
    expect(setup).toContain("Azure App Service publishing");
  });

  it("documents recommended template presets", () => {
    const templateAuthoring = readFileSync(
      "docs/portal/template-authoring.md",
      "utf8",
    );

    expect(templateAuthoring).toContain("Recommended Templates");
    expect(templateAuthoring).toContain("Developer Starters");
    expect(templateAuthoring).toContain("sourceTemplateSlug");
    expect(templateAuthoring).toContain("Department Form + Approval");
  });
});
