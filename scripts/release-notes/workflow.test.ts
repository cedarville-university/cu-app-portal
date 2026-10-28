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
    const generationIndex = steps.findIndex((step: { run?: string }) => step.run === "npm run release-notes:generate");
    const buildIndex = steps.findIndex((step: { run?: string }) => step.run === "npm run build");
    expect(generationIndex).toBeGreaterThan(steps.findIndex((step: { run?: string }) => step.run === "npm ci"));
    expect(buildIndex).toBeGreaterThan(generationIndex);
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts["release-notes:generate"]).toBe("node scripts/release-notes/generate.mjs");
  });
});
