// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workerPath = resolve(
  root,
  ".github/workflows/deploy-repository-import-worker.yml",
);
const portalPath = resolve(root, ".github/workflows/deploy-azure-app-service.yml");

describe("repository import worker deployment workflow", () => {
  it("is valid YAML with manual and scoped main triggers", () => {
    const workflow = parse(readFileSync(workerPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(workflow.name).toBe("Deploy Repository Import Worker");
    expect(workflow.on).toMatchObject({
      workflow_dispatch: null,
      push: { branches: ["main"] },
    });
  });

  it("tests, validates, builds, smokes, and scans before pushing", () => {
    const source = readFileSync(workerPath, "utf8");
    const commands = [
      "npm test",
      "npx prisma validate",
      "npm run build:repository-import-worker",
      "docker build",
      "npm run test:repository-import-container",
      "aquasecurity/trivy-action",
      "docker push",
    ];
    let last = -1;
    for (const command of commands) {
      const index = source.indexOf(command);
      expect(index, command).toBeGreaterThan(last);
      last = index;
    }
  });

  it("uses OIDC, SHA tags, digest resolution, and digest-pinned job updates", () => {
    const source = readFileSync(workerPath, "utf8");
    expect(source).toContain("id-token: write");
    expect(source).toContain("azure/login@v2");
    expect(source).toContain("${{ github.sha }}");
    expect(source).toContain("az acr repository show");
    expect(source).toContain("@${DIGEST}");
    expect(source).toContain("az containerapp job update");
    expect(source).toContain("az resource wait");
    expect(source).not.toMatch(/:latest\b|IMAGE_(REF|TAG)[^\n]*latest/i);
  });

  it("keeps the portal deployment independent of Git and the worker image", () => {
    const portal = readFileSync(portalPath, "utf8");
    expect(portal).not.toContain("workers/repository-import");
    expect(portal).not.toContain("repository-import-worker");
    expect(portal).not.toMatch(/apt-get[^\n]*git|docker build/);
  });
});
