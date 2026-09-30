// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("repository import worker container contract", () => {
  it("pins an exact Node bookworm-slim image digest without latest", () => {
    const dockerfile = read("workers/repository-import/Dockerfile");
    const matches = [
      ...dockerfile.matchAll(
        /FROM node:(24\.\d+\.\d+)-bookworm-slim@sha256:([a-f0-9]{64})/g,
      ),
    ];
    expect(matches.length).toBeGreaterThan(0);
    expect(dockerfile).not.toContain(":latest");
  });

  it("installs Git and certificates explicitly and runs non-root", () => {
    const dockerfile = read("workers/repository-import/Dockerfile");
    expect(dockerfile).toMatch(/apt-get install[^\n]*git[^\n]*ca-certificates/);
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain("/tmp/repository-import");
  });

  it("runs a compiled worker entry point instead of tsx", () => {
    const dockerfile = read("workers/repository-import/Dockerfile");
    expect(dockerfile).toContain('["node", "dist/main.js"]');
    expect(dockerfile).not.toMatch(/ENTRYPOINT[^\n]*tsx/);
    expect(read("tsup.repository-import.config.ts")).toContain(
      "src/workers/repository-import/main.ts",
    );
  });

  it("aligns every external runtime dependency with the worker package", () => {
    const config = read("tsup.repository-import.config.ts");
    const runtimePackage = JSON.parse(
      read("workers/repository-import/package.json"),
    ) as { dependencies: Record<string, string> };
    for (const dependency of [
      "@azure/identity",
      "@azure/service-bus",
      "@prisma/client",
      "nodemailer",
    ]) {
      expect(config).toContain(`"${dependency}"`);
      expect(runtimePackage.dependencies[dependency]).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("defines an offline container smoke command", () => {
    const script = read("scripts/repository-imports/container-smoke.sh");
    expect(script).toContain("--network none");
    expect(script).toContain("git --version");
    expect(script).toContain("refs/heads/");
    expect(script).toContain("refs/tags/");
  });
});
