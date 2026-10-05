import { lstat, mkdir, readlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const cachePath = resolve(".next/cache");
const cache = await lstat(cachePath).catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});

// Azure mounts the application package read-only. Its cache link points to
// writable App Service storage; local builds keep their normal cache directory.
if (cache?.isSymbolicLink()) {
  const target = resolve(dirname(cachePath), await readlink(cachePath));
  await mkdir(target, { recursive: true });
}
