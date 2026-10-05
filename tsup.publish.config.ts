import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/workers/publish/main.ts"],
  outDir: "workers/publish/dist",
  format: ["esm"],
  outExtension: () => ({ js: ".js" }),
  platform: "node",
  target: "node24",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    "@azure/identity",
    "@azure/service-bus",
    "@prisma/client",
    "nodemailer",
  ],
  noExternal: ["libsodium-wrappers", "zod"],
});
