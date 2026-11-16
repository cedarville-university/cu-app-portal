import { describe, expect, it } from "vitest";
import { getActiveTemplateBySlug, getTemplateBySlug, serializeTemplateForStorage } from "./catalog";
import { getTemplatePolicy } from "./policy";
import { createAppSchema } from "@/features/create-app/validation";

describe("MCP template policy", () => {
  it("keeps the advanced template disabled pending the live pilot", () => {
    expect(getActiveTemplateBySlug("mcp-server")).toBeNull();
    expect(getTemplateBySlug("mcp-server")).toMatchObject({ category: "advanced", status: "DISABLED" });
  });
  it("requires delegated Cedarville auth and persists its policy", () => {
    const template = getTemplateBySlug("mcp-server")!;
    expect(getTemplatePolicy(template)).toEqual({ applicationKind: "mcp-server", authenticationMode: "entra-mcp", audience: { cedarville: true, public: false } });
    expect(serializeTemplateForStorage(template).inputSchema).toMatchObject({ audience: { cedarville: true, public: false }, authenticationMode: "entra-mcp" });
    const schema = createAppSchema({ ...template, audience: getTemplatePolicy(template).audience });
    const input = { appName: "Tools", description: "Internal tools", hostingTarget: "Azure App Service", databaseProvider: "none", entraLogin: false, publicAcknowledgement: true };
    expect(schema.safeParse(input).success).toBe(false);
    expect(schema.safeParse({ ...input, entraLogin: true }).success).toBe(true);
    expect(schema.safeParse({ ...input, entraLogin: true, databaseProvider: "postgresql" }).success).toBe(true);
    expect(schema.parse({ ...input, entraLogin: true, databaseProvider: undefined }).databaseProvider).toBe("none");
    expect(schema.safeParse({ ...input, databaseProvider: "postgresql" }).success).toBe(false);
  });
  it("preserves both explicit audiences for existing templates", () => {
    expect(getTemplatePolicy(getTemplateBySlug("web-app")!).audience).toEqual({ cedarville: true, public: true });
  });
});
