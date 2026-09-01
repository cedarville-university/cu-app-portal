#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  lstat,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const APP_ID_PATTERN = /^plugin_asdk_app_[A-Za-z0-9]+$/;
const PLUGIN_NAME = "cedarville-app-portal";

function readAppId(args) {
  const optionIndex = args.indexOf("--app-id");
  const appId = optionIndex === -1 ? undefined : args[optionIndex + 1];

  if (!appId) {
    throw new Error("--app-id is required");
  }
  if (args.length !== 2 || optionIndex !== 0) {
    throw new Error("Usage: finalize-portal-plugin.mjs --app-id <value>");
  }
  if (!APP_ID_PATTERN.test(appId)) {
    throw new Error(
      "The app id must be plugin_asdk_app_ followed by letters or digits",
    );
  }

  return appId;
}

function isWithinRoot(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRoot))
  );
}

async function validateContainedPath(root, path, label, expectedType) {
  const pathStats = await lstat(path);
  if (pathStats.isSymbolicLink()) {
    throw new Error(`Refusing symbolic link for ${label}: ${path}`);
  }
  if (expectedType === "directory" && !pathStats.isDirectory()) {
    throw new Error(`Expected ${label} to be a directory: ${path}`);
  }
  if (expectedType === "file" && !pathStats.isFile()) {
    throw new Error(`Expected ${label} to be a file: ${path}`);
  }

  const resolvedPath = await realpath(path);
  if (!isWithinRoot(root, resolvedPath)) {
    throw new Error(`${label} escapes the target root: ${resolvedPath}`);
  }
  return resolvedPath;
}

async function requireAbsentNonSymlink(path, label) {
  try {
    const pathStats = await lstat(path);
    if (pathStats.isSymbolicLink()) {
      throw new Error(`Refusing symbolic link for ${label}: ${path}`);
    }
    throw new Error(`${label} already exists: ${path}`);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function resolvePluginTarget(invokedRoot) {
  const root = await realpath(invokedRoot);
  const pluginsRoot = resolve(root, "plugins");
  const pluginRoot = resolve(pluginsRoot, PLUGIN_NAME);
  const manifestRoot = resolve(pluginRoot, ".codex-plugin");
  const manifestPath = resolve(pluginRoot, ".codex-plugin", "plugin.json");
  const appPath = resolve(pluginRoot, ".app.json");

  await validateContainedPath(
    root,
    pluginsRoot,
    "plugins directory",
    "directory",
  );
  await validateContainedPath(root, pluginRoot, "plugin directory", "directory");
  await validateContainedPath(
    root,
    manifestRoot,
    "plugin manifest directory",
    "directory",
  );
  await validateContainedPath(root, manifestPath, "plugin manifest", "file");
  await requireAbsentNonSymlink(appPath, "plugin app mapping");

  return { root, pluginRoot, manifestRoot, manifestPath, appPath };
}

async function finalizePlugin(appId, target) {
  const { manifestRoot, manifestPath, appPath } = target;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (manifest.name !== PLUGIN_NAME) {
    throw new Error(`Expected plugin manifest name ${PLUGIN_NAME}`);
  }

  const appMapping = {
    apps: {
      [PLUGIN_NAME]: { id: appId },
    },
  };
  const finalizedManifest = {
    ...manifest,
    apps: "./.app.json",
  };
  const temporaryManifestPath = resolve(
    manifestRoot,
    `.plugin.json.finalize-${process.pid}-${randomUUID()}.tmp`,
  );
  let appCreated = false;

  try {
    await writeFile(
      temporaryManifestPath,
      `${JSON.stringify(finalizedManifest, null, 2)}\n`,
      { flag: "wx" },
    );
    await writeFile(appPath, `${JSON.stringify(appMapping, null, 2)}\n`, {
      flag: "wx",
    });
    appCreated = true;
    await rename(temporaryManifestPath, manifestPath);
  } catch (error) {
    if (appCreated) {
      await rm(appPath, { force: true });
    }
    await rm(temporaryManifestPath, { force: true });
    throw error;
  }
}

const invokedRoot = resolve(process.cwd());
let targetRoot = invokedRoot;
let pluginRoot = resolve(targetRoot, "plugins", PLUGIN_NAME);

try {
  const appId = readAppId(process.argv.slice(2));
  const target = await resolvePluginTarget(invokedRoot);
  targetRoot = target.root;
  pluginRoot = target.pluginRoot;
  await finalizePlugin(appId, target);
  console.log(`Target root: ${targetRoot}`);
  console.log(`Plugin path: ${pluginRoot}`);
  console.log("Finalized Cedarville App Portal plugin registration.");
} catch (error) {
  try {
    targetRoot = await realpath(invokedRoot);
    pluginRoot = resolve(targetRoot, "plugins", PLUGIN_NAME);
  } catch {
    // Keep the explicit invoked path when it cannot be resolved.
  }
  console.error(`Target root: ${targetRoot}`);
  console.error(`Plugin path: ${pluginRoot}`);
  console.error(
    `Error: ${error instanceof Error ? error.message : "Unknown failure"}`,
  );
  process.exitCode = 1;
}
