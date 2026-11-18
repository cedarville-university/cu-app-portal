import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      // Tests, including worker CI, use fixed data without generating portal artifacts.
      {
        find: /^.*\/\.generated\/release-notes\.json$/,
        replacement: fileURLToPath(new URL("./src/test/fixtures/release-notes.json", import.meta.url)),
      },
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  test: {
    environment: "jsdom",
    exclude: [
      ...configDefaults.exclude,
      "e2e/**",
      ".worktrees/**",
      ".claude/worktrees/**",
    ],
    setupFiles: ["./src/test/setup.ts"],
  },
});
