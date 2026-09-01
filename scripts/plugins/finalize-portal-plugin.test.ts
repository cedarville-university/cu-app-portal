import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
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

function makeTemporaryRoot(prefix = "cedarville-portal-plugin-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function makeFixture() {
  const root = makeTemporaryRoot();
  const pluginRoot = resolve(root, "plugins/cedarville-app-portal");
  cpSync(sourcePluginRoot, pluginRoot, { recursive: true });
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
    expect(`${result.stdout}${result.stderr}`).toContain(
      `Target root: ${realpathSync(root)}`,
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
    expect(result.stdout).toContain(`Target root: ${realpathSync(root)}`);
    expect(result.stdout).toContain(
      `Plugin path: ${resolve(realpathSync(root), "plugins/cedarville-app-portal")}`,
    );
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

  it("rejects a plugin-directory symlink escape without changing either checkout", () => {
    const root = makeTemporaryRoot("cedarville-portal-root-");
    const outsideRoot = makeTemporaryRoot("cedarville-portal-outside-");
    const pluginRoot = resolve(root, "plugins/cedarville-app-portal");
    const outsidePluginRoot = resolve(
      outsideRoot,
      "plugins/cedarville-app-portal",
    );
    mkdirSync(resolve(root, "plugins"), { recursive: true });
    cpSync(sourcePluginRoot, outsidePluginRoot, { recursive: true });
    symlinkSync(outsidePluginRoot, pluginRoot, "dir");
    const outsideManifestPath = resolve(
      outsidePluginRoot,
      ".codex-plugin/plugin.json",
    );
    const sourceManifestPath = resolve(
      sourcePluginRoot,
      ".codex-plugin/plugin.json",
    );
    const outsideManifestBefore = readFileSync(outsideManifestPath, "utf8");
    const sourceManifestBefore = readFileSync(sourceManifestPath, "utf8");

    const result = runFinalizer(root, ["--app-id", "plugin_asdk_app_AbC123"]);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("Refusing symbolic link");
    expect(`${result.stdout}${result.stderr}`).toContain(
      `Target root: ${realpathSync(root)}`,
    );
    expect(existsSync(resolve(outsidePluginRoot, ".app.json"))).toBe(false);
    expect(readFileSync(outsideManifestPath, "utf8")).toBe(
      outsideManifestBefore,
    );
    expect(readFileSync(sourceManifestPath, "utf8")).toBe(sourceManifestBefore);
    expect(existsSync(resolve(sourcePluginRoot, ".app.json"))).toBe(false);
  });

  it("rejects a symlinked manifest path without changing its outside target", () => {
    const { root, pluginRoot } = makeFixture();
    const outsideRoot = makeTemporaryRoot("cedarville-manifest-outside-");
    const manifestPath = resolve(pluginRoot, ".codex-plugin/plugin.json");
    const outsideManifestPath = resolve(outsideRoot, "plugin.json");
    const sourceManifestPath = resolve(
      sourcePluginRoot,
      ".codex-plugin/plugin.json",
    );
    const manifestBefore = readFileSync(manifestPath, "utf8");
    const sourceManifestBefore = readFileSync(sourceManifestPath, "utf8");
    writeFileSync(outsideManifestPath, manifestBefore);
    rmSync(manifestPath);
    symlinkSync(outsideManifestPath, manifestPath, "file");

    const result = runFinalizer(root, ["--app-id", "plugin_asdk_app_AbC123"]);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("Refusing symbolic link");
    expect(existsSync(resolve(pluginRoot, ".app.json"))).toBe(false);
    expect(readFileSync(outsideManifestPath, "utf8")).toBe(manifestBefore);
    expect(readFileSync(sourceManifestPath, "utf8")).toBe(sourceManifestBefore);
    expect(existsSync(resolve(sourcePluginRoot, ".app.json"))).toBe(false);
  });

  it("rejects a wrong manifest identity before writing either file", () => {
    const { root, pluginRoot } = makeFixture();
    const manifestPath = resolve(pluginRoot, ".codex-plugin/plugin.json");
    const wrongManifest = {
      ...readJson(manifestPath),
      name: "not-cedarville-app-portal",
    };
    writeFileSync(manifestPath, `${JSON.stringify(wrongManifest, null, 2)}\n`);
    const manifestBefore = readFileSync(manifestPath, "utf8");
    const sourceManifestPath = resolve(
      sourcePluginRoot,
      ".codex-plugin/plugin.json",
    );
    const sourceManifestBefore = readFileSync(sourceManifestPath, "utf8");

    const result = runFinalizer(root, ["--app-id", "plugin_asdk_app_AbC123"]);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "Expected plugin manifest name cedarville-app-portal",
    );
    expect(`${result.stdout}${result.stderr}`).toContain(
      `Plugin path: ${resolve(realpathSync(root), "plugins/cedarville-app-portal")}`,
    );
    expect(existsSync(resolve(pluginRoot, ".app.json"))).toBe(false);
    expect(readFileSync(manifestPath, "utf8")).toBe(manifestBefore);
    expect(readFileSync(sourceManifestPath, "utf8")).toBe(sourceManifestBefore);
    expect(existsSync(resolve(sourcePluginRoot, ".app.json"))).toBe(false);
  });
});
