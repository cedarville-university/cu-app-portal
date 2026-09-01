import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const pluginRoot = resolve(root, "plugins/cedarville-app-portal");
const skillRoot = resolve(
  pluginRoot,
  "skills/cedarville-app-portal-workspace",
);

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("Cedarville App Portal workspace plugin package", () => {
  it("declares the skills-only plugin and university marketplace contracts", () => {
    const plugin = readJson(resolve(pluginRoot, ".codex-plugin/plugin.json"));
    const marketplace = readJson(
      resolve(root, ".agents/plugins/marketplace.json"),
    );

    expect(plugin).toMatchObject({
      name: "cedarville-app-portal",
      version: "1.0.0",
      skills: "./skills/",
    });
    expect(plugin).not.toHaveProperty("apps");

    expect(marketplace).toMatchObject({
      name: "cedarville-university-plugins",
      interface: { displayName: "Cedarville University" },
      plugins: [
        {
          name: "cedarville-app-portal",
          source: {
            source: "local",
            path: "./plugins/cedarville-app-portal",
          },
          policy: {
            installation: "AVAILABLE",
            authentication: "ON_INSTALL",
          },
          category: "Developer Tools",
        },
      ],
    });
    expect(existsSync(resolve(pluginRoot, ".app.json"))).toBe(false);
  });

  it("keeps the workspace skill distinct and exposes every MCP tool", () => {
    const skill = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");
    const tools = [
      "list_app_templates",
      "list_my_apps",
      "create_app",
      "get_app",
      "request_github_access",
      "publish_app_to_azure",
      "get_publish_status",
      "repair_publishing_setup",
      "retry_publish",
    ];

    expect(skill).toContain("name: cedarville-app-portal-workspace");
    for (const tool of tools) {
      expect(skill).toContain(tool);
    }
  });

  it("teaches the approved creation, customization, and recovery boundaries", () => {
    const skill = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");

    expect(skill).toContain("Creation never publishes");
    expect(skill).toContain("separate explicit request");
    expect(skill).toMatch(/one plain-language question at a time/i);
    expect(skill).toMatch(/public acknowledgement/i);
    expect(skill).toMatch(/reuse the same idempotency key/i);
    expect(skill).toMatch(/repository readiness.*does not prove/i);
    expect(skill).toMatch(/HTTPS.*browser or operating-system sign-in/is);
    expect(skill).toMatch(/at most six status checks over ten minutes/i);
    expect(skill).toMatch(/verified, partial, or blocked/i);
    expect(skill).toMatch(/never automatically repair or retry/i);
    expect(skill).toMatch(/do not reveal or infer.*existence.*ownership.*access/is);
    expect(skill).toMatch(/existing GitHub or local app imports/i);
    expect(skill).toMatch(/collaborator management/i);
    expect(skill).toMatch(/environment variables/i);
    expect(skill).toMatch(/push-to-deploy/i);
    expect(skill).toMatch(/deletion/i);
    expect(skill).toMatch(/Cedarville App Portal UI/i);
  });

  it("closes the observed consent, invitation, and quiet-not-found loopholes", () => {
    const skill = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");

    expect(skill).toContain(
      "Codex may recommend a template, but must not select or infer one on the user's behalf.",
    );
    expect(skill).toContain(
      "The user must explicitly select the template before the creation summary, approval, or `create_app` call.",
    );
    expect(skill).toContain(
      "Only actor-specific `repositoryAccess.status === GRANTED` is clone, fetch, and push ready.",
    );
    expect(skill).toContain(
      "`INVITED` is partial: ask the actor to accept the invitation, then refresh with `get_app`.",
    );
    expect(skill).toContain(
      "Do not repeat `request_github_access` merely because the invitation remains pending.",
    );
    expect(skill).toContain("`FAILED` is blocked.");
    expect(skill).toContain(
      "After `NOT_FOUND`, say only that no accessible app was found and stop.",
    );
    expect(skill).toContain(
      "Do not call `list_my_apps`, retry alternate IDs, or perform further discovery unless the user separately asks to list their accessible apps.",
    );
  });

  it("uses one stable replay contract for every mutating tool", () => {
    const skill = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");
    const replayContract = skill.match(
      /For every mutating tool[\s\S]*?(?=\n\n)/,
    )?.[0];
    const mutatingTools = [
      "create_app",
      "request_github_access",
      "publish_app_to_azure",
      "repair_publishing_setup",
      "retry_publish",
    ];

    expect(replayContract).toBeDefined();
    for (const tool of mutatingTools) {
      expect(replayContract).toContain(`\`${tool}\``);
    }
    expect(replayContract).toContain(
      "Publish and republish both use `publish_app_to_azure`.",
    );
    expect(replayContract).toContain(
      "replay it with the same UUID and identical input",
    );
    expect(replayContract).toContain(
      "A new key means a deliberately new operation",
    );
    expect(replayContract).toContain(
      "renew the user's intent before a consequential new operation",
    );
  });

  it("keeps implicit invocation and the approved skill interface metadata", () => {
    const metadata = readFileSync(resolve(skillRoot, "agents/openai.yaml"), "utf8");

    expect(metadata).toContain('display_name: "Cedarville App Portal"');
    expect(metadata).toContain(
      'short_description: "Create and publish Cedarville-managed apps from Codex."',
    );
    expect(metadata).toContain(
      'default_prompt: "Create a new Cedarville app from an approved portal template."',
    );
    expect(metadata).toContain("allow_implicit_invocation: true");
  });
});
