// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSourceSnapshot } from "./build-source-snapshot";
import { buildDeploymentManifest } from "./deployment-manifest";

export const mcpInput = { templateSlug: "mcp-server", appName: 'Tools " <test>', description: "Internal tools", hostingTarget: "Azure App Service" as const, databaseProvider: "none" as const, entraLogin: true };
describe("MCP generated source", () => {
  it("generates a separate bearer-authenticated engine with no browser credentials", async () => {
    const files = await buildSourceSnapshot(mcpInput);
    expect(JSON.parse(files["package.json"]).dependencies).toMatchObject({ "@modelcontextprotocol/sdk": "1.30.0", jose: "6.2.10" });
    expect(files["src/mcp/handler.ts"]).toBeTruthy();
    expect(files["src/auth.ts"]).toBeUndefined();
    expect(files[".env.example"]).not.toMatch(/AUTH_SECRET|CLIENT_SECRET/);
    expect(files["package-lock.json"]).toBeTruthy();
    expect(files["docs/plugin-creator-handoff.md"]).toMatch(/existing MCP server/i);
    expect(files[".github/workflows/deploy-azure-app-service.yml"]).toContain("workflow_dispatch");
    expect(JSON.parse(files["package.json"]).dependencies).not.toHaveProperty("@prisma/client");
    expect(files["prisma/schema.prisma"]).toBeUndefined();
    expect(files["src/lib/db.ts"]).toBeUndefined();
    expect(files[".env.example"]).not.toContain("DATABASE_URL");
  });
  it("generates PostgreSQL dependencies, a migration, and secure runtime configuration only when selected", async () => {
    const files=await buildSourceSnapshot({...mcpInput,databaseProvider:"postgresql"});
    const pkg=JSON.parse(files["package.json"]);
    expect(pkg.dependencies).toMatchObject({"@prisma/client":"6.19.3",prisma:"6.19.3"});
    expect(pkg.dependencies).not.toHaveProperty("next-auth");
    expect(pkg.scripts).toMatchObject({prebuild:"prisma generate",start:"prisma migrate deploy && next start","db:migrate":"prisma migrate dev"});
    expect(JSON.parse(files["package-lock.json"]).packages[""].dependencies).toEqual(pkg.dependencies);
    expect(files["prisma/schema.prisma"]).toContain('provider = "postgresql"');
    expect(files["prisma/migrations/00000000000000_init/migration.sql"]).toContain('CREATE TABLE "AppSetting"');
    expect(files["src/lib/db.ts"]).toContain("PrismaClient");
    expect(files[".env.example"]).toContain("DATABASE_URL=postgresql://portal:portal@localhost:5432/tools-test?schema=public");
    expect(files["src/app/api/health/route.ts"]).not.toMatch(/Prisma|DATABASE_URL|lib\/db/);
    expect(JSON.parse(files["app-portal/deployment-manifest.json"]).applicationSettings).toContain("DATABASE_URL");
  });
  it("uses bearer mode in the new manifest without auth callback settings", () => {
    expect(buildDeploymentManifest(mcpInput)).toMatchObject({ schemaVersion: "1.1.0", applicationKind: "mcp-server", auth: { mode: "entra-mcp" }, mcp: { endpointPath: "/api/mcp", transport: "streamable-http" } });
    expect(buildDeploymentManifest(mcpInput).applicationSettings).not.toContain("AUTH_SECRET");
  });
});
