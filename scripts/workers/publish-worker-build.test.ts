// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("imports the built publishing worker without starting it", () => {
  const output = mkdtempSync(resolve("workers/publish/.build-smoke-"));
  try {
    execFileSync("npm", ["run", "build:publish-worker", "--", "--out-dir", output], {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 30_000,
    });
    const entry = pathToFileURL(join(output, "main.js")).href;
    const result = execFileSync(process.execPath, [
      "--input-type=module",
      "-e",
      `const worker = await import(${JSON.stringify(entry)}); if (typeof worker.runPublishWorker !== "function") process.exit(1); console.log("worker import ok");`,
    ], { encoding: "utf8", timeout: 10_000, stdio: "pipe" });
    expect(result.trim()).toBe("worker import ok");
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}, 45_000);
