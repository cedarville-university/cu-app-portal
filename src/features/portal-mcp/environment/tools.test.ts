import { describe, expect, it, vi } from "vitest";
import { PortalApiError } from "@/features/portal-api/errors";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";
import { registerGetAppEnvironmentTool } from "../tools/get-app-environment";
import { registerSetAppEnvironmentTool } from "../tools/set-app-environment";
import { getAppEnvironmentSchema, setAppEnvironmentSchema } from "./schemas";

type Tool = { config: { annotations: Record<string, boolean> }; handler: (input: unknown) => Promise<unknown> };
const write = { appId: "app-1", variables: [{ key: "APP_TITLE", value: "Campus" }], idempotencyKey: "00000000-0000-4000-8000-000000000001" };
function fixture() {
  const tools = new Map<string, Tool>();
  const server = { registerTool: (name: string, config: Tool["config"], handler: Tool["handler"]) => tools.set(name, { config, handler }) } as unknown as PortalMcpServer;
  const cached = new Map<string, unknown>();
  const context = {
    actor: { userId: "owner", isAdmin: false },
    authorizeEnvironmentApp: vi.fn().mockResolvedValue({ id: "app-1" }),
    getAppEnvironment: vi.fn().mockResolvedValue({ appId: "app-1", variables: [{ key: "APP_TITLE", isSecret: false, value: "Campus" }, { key: "SAVED", isSecret: true, valueStatus: "secret" }], nextOffset: null }),
    setAppEnvironment: vi.fn().mockResolvedValue({ appId: "app-1", keys: ["APP_TITLE"], application: "live_settings_update" }),
    claimPortalRateLimit: vi.fn().mockResolvedValue(undefined),
    executeIdempotentMutation: vi.fn(async (options: { idempotencyKey: string; claimRateLimit: () => Promise<void>; execute: () => Promise<unknown> }) => {
      if (cached.has(options.idempotencyKey)) return cached.get(options.idempotencyKey);
      await options.claimRateLimit(); const result = await options.execute(); cached.set(options.idempotencyKey, result); return result;
    }),
  };
  registerGetAppEnvironmentTool(server, context as unknown as PortalMcpToolContext);
  registerSetAppEnvironmentTool(server, context as unknown as PortalMcpToolContext);
  const invoke = (name: string, input: unknown) => tools.get(name)!.handler(input);
  return { context, tools, invoke, cached };
}

describe("environment MCP adapters", () => {
  it("advertises correct read/mutation risks", () => {
    const f = fixture();
    expect(f.tools.get("get_app_environment")!.config.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    expect(f.tools.get("set_app_environment")!.config.annotations).toEqual({ readOnlyHint: false, destructiveHint: true, openWorldHint: true });
  });
  it("uses the read limiter and returns saved ordinary values plus secret metadata", async () => {
    const f = fixture(); const result = await f.invoke("get_app_environment", { appId: "app-1" });
    expect(f.context.claimPortalRateLimit).toHaveBeenCalledWith("owner", "read");
    expect(result).toMatchObject({ structuredContent: { variables: [{ key: "APP_TITLE", value: "Campus" }, { key: "SAVED", valueStatus: "secret" }] } });
  });
  it("replays a batch with its stable UUID and never echoes values in mutation/cached output", async () => {
    const f = fixture();
    const first = await f.invoke("set_app_environment", write); const second = await f.invoke("set_app_environment", write);
    expect(second).toEqual(first); expect(f.context.setAppEnvironment).toHaveBeenCalledTimes(1);
    expect(f.context.authorizeEnvironmentApp).toHaveBeenCalledTimes(2);
    expect(f.context.claimPortalRateLimit).toHaveBeenCalledWith("owner", "set_app_environment");
    expect(f.context.executeIdempotentMutation).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "owner", operation: "set_app_environment", idempotencyKey: write.idempotencyKey, input: { appId: "app-1", variables: write.variables } }));
    expect(JSON.stringify(first)).not.toContain("Campus"); expect(JSON.stringify([...f.cached.values()])).not.toContain("Campus");
  });
  it("denies revoked access before replaying a cached result", async () => {
    const f = fixture(); await f.invoke("set_app_environment", write);
    f.context.authorizeEnvironmentApp.mockRejectedValueOnce(new PortalApiError("NOT_FOUND", "App not found."));
    expect(await f.invoke("set_app_environment", write)).toMatchObject({ isError: true, structuredContent: { code: "NOT_FOUND" } });
    expect(f.context.executeIdempotentMutation).toHaveBeenCalledTimes(1); expect(f.context.setAppEnvironment).toHaveBeenCalledTimes(1);
  });
  it("does not execute a mutation after a rate-limit denial", async () => {
    const f = fixture(); f.context.claimPortalRateLimit.mockRejectedValue(new PortalApiError("RATE_LIMITED", "Too many requests.", 60));
    expect(await f.invoke("set_app_environment", write)).toMatchObject({ isError: true, structuredContent: { code: "RATE_LIMITED" } });
    expect(f.context.setAppEnvironment).not.toHaveBeenCalled();
  });
  it("does not forward raw exceptions", async () => {
    const f = fixture(); f.context.setAppEnvironment.mockRejectedValue(new Error("upstream echoed Campus and a synthetic credential"));
    const result = await f.invoke("set_app_environment", write);
    expect(result).toMatchObject({ isError: true, structuredContent: { code: "PROVIDER_FAILURE" } });
    expect(JSON.stringify(result)).not.toMatch(/Campus|synthetic credential/);
  });
  it("rejects arbitrary fields, secret flags, delete operations and invalid bounds", () => {
    expect(getAppEnvironmentSchema.safeParse({ appId: "app-1", limit: 101 }).success).toBe(false);
    expect(getAppEnvironmentSchema.safeParse({ appId: "app-1", offset: -1 }).success).toBe(false);
    expect(getAppEnvironmentSchema.safeParse({ appId: "app-1", url: "https://example.test" }).success).toBe(false);
    for (const variables of [[], [{ key: "APP_TITLE", value: "Title", isSecret: false }], [{ key: "APP_TITLE", operation: "delete" }], [{ key: "TITLE", value: "x".repeat(4097) }]]) {
      expect(setAppEnvironmentSchema.safeParse({ ...write, variables }).success).toBe(false);
    }
    expect(setAppEnvironmentSchema.safeParse({ ...write, variables: Array.from({ length: 100 }, (_, index) => ({ key: `FLAG_${index}`, value: "on" })) }).success).toBe(true);
  });
  it("rejects malformed direct calls safely without auth/provider dependencies", async () => {
    const f = fixture(); const result = await f.invoke("set_app_environment", { ...write, variables: [{ key: "APP_TITLE", value: "Campus", isSecret: true }] });
    expect(result).toMatchObject({ isError: true, structuredContent: { code: "INVALID_INPUT" } });
    expect(f.context.authorizeEnvironmentApp).not.toHaveBeenCalled(); expect(f.context.executeIdempotentMutation).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain("Campus");
  });
});
