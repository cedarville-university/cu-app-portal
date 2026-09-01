#!/usr/bin/env node

import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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

async function finalizePlugin(appId) {
  const pluginRoot = resolve(process.cwd(), "plugins", PLUGIN_NAME);
  const manifestPath = resolve(pluginRoot, ".codex-plugin", "plugin.json");
  const appPath = resolve(pluginRoot, ".app.json");
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

  await writeFile(appPath, `${JSON.stringify(appMapping, null, 2)}\n`, {
    flag: "wx",
  });
  try {
    await writeFile(
      manifestPath,
      `${JSON.stringify(finalizedManifest, null, 2)}\n`,
    );
  } catch (error) {
    await rm(appPath, { force: true });
    throw error;
  }
}

try {
  const appId = readAppId(process.argv.slice(2));
  await finalizePlugin(appId);
  console.log("Finalized Cedarville App Portal plugin registration.");
} catch (error) {
  console.error(
    `Error: ${error instanceof Error ? error.message : "Unknown failure"}`,
  );
  process.exitCode = 1;
}
