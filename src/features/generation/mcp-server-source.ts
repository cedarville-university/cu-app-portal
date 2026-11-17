import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { buildTokenMap } from "./token-replacements";
import { renderTemplateString } from "./render-template";

/** Keep the stateless and PostgreSQL packages locked independently. */
export async function buildMcpServerGeneratedFiles(input: CreateAppRequestInput): Promise<Record<string,string>> {
  const root = path.join(process.cwd(), "templates/mcp-server");
  const hasDatabase = input.databaseProvider === "postgresql";
  const tokens = buildTokenMap(input);
  const render = (source: string) => renderTemplateString(source, tokens);
  const packageJson = JSON.parse(render(await readFile(path.join(root, "files/package.json.template"), "utf8")));
  if (hasDatabase) {
    Object.assign(packageJson.dependencies, { "@prisma/client": "6.19.3", prisma: "6.19.3", "server-only": "0.0.1" });
    Object.assign(packageJson.scripts, {
      predev: "prisma generate", prebuild: "prisma generate", pretypecheck: "prisma generate",
      start: "prisma migrate deploy && next start",
      "db:generate": "prisma generate", "db:deploy": "prisma migrate deploy", "db:migrate": "prisma migrate dev",
    });
  }
  const lockPath = hasDatabase ? "postgresql/package-lock.json.template" : "files/package-lock.json.template";
  const baseEnv = render(await readFile(path.join(root,"files/.env.example.template"), "utf8"));
  return {
    "package.json": `${JSON.stringify(packageJson,null,2)}\n`,
    "package-lock.json": render(await readFile(path.join(root,lockPath),"utf8")),
    ".env.example": baseEnv + (hasDatabase ? `DATABASE_URL=postgresql://portal:portal@localhost:5432/${tokens.APP_NAME_SLUG}?schema=public\n` : ""),
  };
}
