import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const sourceRoot = process.cwd();
const scriptPath = resolve(
  sourceRoot,
  "scripts/plugins/finalize-portal-plugin.mjs",
);
const sourcePluginRoot = resolve(
  sourceRoot,
  "plugins/cedarville-app-portal",
);
const temporaryRoots: string[] = [];

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "cedarville-portal-plugin-"));
  const pluginRoot = resolve(root, "plugins/cedarville-app-portal");
  cpSync(sourcePluginRoot, pluginRoot, { recursive: true });
  temporaryRoots.push(root);
  return { root, pluginRoot };
}

function runFinalizer(root: string, args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("finalize-portal-plugin", () => {
  it("rejects a missing app id without changing the copied plugin", () => {
    const { root, pluginRoot } = makeFixture();
    const result = runFinalizer(root, []);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "--app-id is required",
    );
    expect(existsSync(resolve(pluginRoot, ".app.json"))).toBe(false);
    expect(
      readJson(resolve(pluginRoot, ".codex-plugin/plugin.json")),
    ).not.toHaveProperty("apps");
  });

  it.each([
    "plugin_asdk_app_",
    "plugin_asdk_app_has-hyphen",
    "asdk_app_AbC123",
    "connector_AbC123",
  ])("rejects invalid app id %s", (appId) => {
    const { root, pluginRoot } = makeFixture();
    const result = runFinalizer(root, ["--app-id", appId]);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "plugin_asdk_app_ followed by letters or digits",
    );
    expect(existsSync(resolve(pluginRoot, ".app.json"))).toBe(false);
  });

  it("writes the app mapping and manifest reference in only the copied plugin", () => {
    const { root, pluginRoot } = makeFixture();
    const appId = "plugin_asdk_app_AbC123";
    const result = runFinalizer(root, ["--app-id", appId]);

    expect(result.status).toBe(0);
    expect(
      readJson(resolve(pluginRoot, ".app.json")),
    ).toEqual({
      apps: {
        "cedarville-app-portal": { id: appId },
      },
    });
    expect(
      readJson(resolve(pluginRoot, ".codex-plugin/plugin.json")),
    ).toMatchObject({ apps: "./.app.json" });
    expect(existsSync(resolve(sourcePluginRoot, ".app.json"))).toBe(false);
  });
});
