// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("creates a missing external cache target so image caching can write through the link", () => {
  const root = mkdtempSync(join(tmpdir(), "portal-next-cache-"));
  try {
    const target = join(root, "runtime", "cache");
    mkdirSync(join(root, ".next"));
    symlinkSync(target, join(root, ".next", "cache"));
    execFileSync(process.execPath, [resolve("scripts/prepare-next-cache.mjs")], { cwd: root });
    mkdirSync(join(root, ".next", "cache", "images"));
    writeFileSync(join(root, ".next", "cache", "images", "sample"), "image");
    expect(readFileSync(join(target, "images", "sample"), "utf8")).toBe("image");
    execFileSync(process.execPath, [resolve("scripts/prepare-next-cache.mjs")], { cwd: root });
    expect(readFileSync(join(target, "images", "sample"), "utf8")).toBe("image");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
