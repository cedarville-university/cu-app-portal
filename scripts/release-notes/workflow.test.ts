// @vitest-environment node
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

describe("portal release-note deployment contract", () => {
  it("collects complete reachable history before building on main pushes", () => {
    const workflow = parse(readFileSync(".github/workflows/deploy-azure-app-service.yml", "utf8"));
    const steps = workflow.jobs.deploy.steps;
    expect(workflow.on).toMatchObject({ workflow_dispatch: null, push: { branches: ["main"] } });
    expect(workflow.jobs.deploy.permissions.contents).toBe("read");
    expect(steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/checkout@")).with["fetch-depth"]).toBe(0);
    const buildIndex = steps.findIndex((step: { run?: string }) => step.run === "npm run build");
    expect(buildIndex).toBeGreaterThan(steps.findIndex((step: { run?: string }) => step.run === "npm ci"));
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    expect(scripts["release-notes:generate"]).toBe("node scripts/release-notes/generate.mjs");
    for (const hook of ["prebuild", "predev", "pretest", "pretest:watch"]) {
      expect(scripts[hook], hook).toBe("npm run release-notes:generate");
    }
  });
});
