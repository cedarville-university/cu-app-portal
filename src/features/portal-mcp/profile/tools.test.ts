import { describe, expect, it, vi } from "vitest";
import { PortalApiError } from "@/features/portal-api/errors";
import { executeIdempotentMutation } from "@/features/portal-api/idempotency";
import { InMemoryPortalOperationStore } from "@/test/portal-operation-store";
import type { PortalActor } from "@/features/portal-api/principal";
import { createPortalMcpHandler, type PortalMcpDependencies } from "../server";

const actor: PortalActor = { userId: "employee", entraOid: "entra", email: "employee@cedarville.edu", displayName: "Employee", isAdmin: false };
const firstKey = "00000000-0000-4000-8000-000000000001";
const secondKey = "00000000-0000-4000-8000-000000000002";

function fixture() {
  let githubUsername: string | null = "saved-user";
  const store = new InMemoryPortalOperationStore();
  const deps = {
    getMyProfile: vi.fn(async () => ({ displayName: "Employee", email: "employee@cedarville.edu", githubUsername })),
    setMyGitHubUsername: vi.fn(async (_actor: PortalActor, value: string) => { githubUsername = value; return { githubUsername }; }),
    claimPortalRateLimit: vi.fn(async () => {}),
    executeIdempotentMutation: ((options) => executeIdempotentMutation({ ...options, store })) as PortalMcpDependencies["executeIdempotentMutation"],
  };
  const handler = createPortalMcpHandler(actor, deps);
  async function request(method: string, params: Record<string, unknown>) {
    const response = await handler(new Request("https://portal.example.edu/api/mcp", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method, ...(method === "tools/call" ? { "Mcp-Name": String(params.name) } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params: { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} } } }),
    }));
    return response.json();
  }
  const invoke = async (name: string, input: Record<string, unknown> = {}) => (await request("tools/call", { name, arguments: input })).result;
  return { deps, invoke, request, store };
}

describe("self-profile MCP tools through the real handler", () => {
  it("returns the actor's saved username and portal commit-author identity", async () => {
    const f = fixture();
    expect(await f.invoke("get_my_profile")).toMatchObject({ structuredContent: { profile: { githubUsername: "saved-user", email: "employee@cedarville.edu", displayName: "Employee" } } });
    expect(f.deps.getMyProfile).toHaveBeenCalledWith(actor);
    expect(f.deps.claimPortalRateLimit).toHaveBeenCalledWith("employee", "read");
  });

  it("publishes strict self-only schemas and accurate annotations", async () => {
    const f = fixture();
    const { result } = await f.request("tools/list", {});
    const read = result.tools.find((tool: { name: string }) => tool.name === "get_my_profile");
    const write = result.tools.find((tool: { name: string }) => tool.name === "set_my_github_username");
    expect(read?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    expect(write?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: false });
    expect(read?.inputSchema.additionalProperties).toBe(false);
    expect(write?.inputSchema.additionalProperties).toBe(false);
    expect(write?.inputSchema.required).toEqual(expect.arrayContaining(["githubUsername", "idempotencyKey"]));
  });

  it("normalizes, rate limits, persists, and replays saves without undoing a newer save", async () => {
    const f = fixture();
    const first = await f.invoke("set_my_github_username", { githubUsername: "  First-User  ", idempotencyKey: firstKey });
    expect(first).toMatchObject({ structuredContent: { githubUsername: "first-user" } });
    expect(f.deps.setMyGitHubUsername).toHaveBeenCalledWith(actor, "first-user");
    await f.invoke("set_my_github_username", { githubUsername: "new-user", idempotencyKey: secondKey });
    expect(await f.invoke("set_my_github_username", { githubUsername: "first-user", idempotencyKey: firstKey })).toEqual(first);
    expect(f.deps.setMyGitHubUsername).toHaveBeenCalledTimes(2);
    expect(f.deps.claimPortalRateLimit).toHaveBeenCalledTimes(2);
    expect(f.deps.claimPortalRateLimit).toHaveBeenCalledWith("employee", "set_my_github_username");
    expect(await f.invoke("get_my_profile")).toMatchObject({ structuredContent: { profile: { githubUsername: "new-user" } } });
    expect(f.store.records[0]).toMatchObject({ actorUserId: "employee", operation: "set_my_github_username", state: "SUCCEEDED" });
  });

  it("rejects changed inputs for the same save UUID", async () => {
    const f = fixture();
    await f.invoke("set_my_github_username", { githubUsername: "first-user", idempotencyKey: firstKey });
    expect(await f.invoke("set_my_github_username", { githubUsername: "other-user", idempotencyKey: firstKey })).toMatchObject({ isError: true, structuredContent: { code: "CONFLICT" } });
    expect(f.deps.setMyGitHubUsername).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["get_my_profile", { userId: "someone-else" }],
    ["set_my_github_username", { githubUsername: "someone", idempotencyKey: firstKey, userId: "someone-else" }],
    ["set_my_github_username", { githubUsername: "user@example.com", idempotencyKey: firstKey }],
    ["set_my_github_username", { githubUsername: "valid-user", idempotencyKey: "bad" }],
    ["set_my_github_username", { githubUsername: "" , idempotencyKey: firstKey }],
  ])("rejects invalid %s arguments before profile access", async (name, input) => {
    const f = fixture(); const result = await f.invoke(name as string, input as Record<string, unknown>);
    expect(result.isError).toBe(true);
    expect(f.deps.getMyProfile).not.toHaveBeenCalled();
    expect(f.deps.setMyGitHubUsername).not.toHaveBeenCalled();
  });

  it.each(["get_my_profile", "set_my_github_username"])("stops %s on a rate denial", async (name) => {
    const f = fixture();
    f.deps.claimPortalRateLimit.mockRejectedValue(new PortalApiError("RATE_LIMITED", "Too many requests.", 60));
    expect(await f.invoke(name, name === "get_my_profile" ? {} : { githubUsername: "user", idempotencyKey: firstKey })).toMatchObject({ isError: true, structuredContent: { code: "RATE_LIMITED" } });
    expect(f.deps.getMyProfile).not.toHaveBeenCalled();
    expect(f.deps.setMyGitHubUsername).not.toHaveBeenCalled();
  });

  it.each(["get_my_profile", "set_my_github_username"])("redacts raw failures in %s", async (name) => {
    const f = fixture();
    f.deps.getMyProfile.mockRejectedValue(new Error("database credential private"));
    f.deps.setMyGitHubUsername.mockRejectedValue(new Error("database credential private"));
    const result = await f.invoke(name, name === "get_my_profile" ? {} : { githubUsername: "user", idempotencyKey: firstKey });
    expect(result).toMatchObject({ isError: true, structuredContent: { code: "PROVIDER_FAILURE" } });
    expect(JSON.stringify(result)).not.toContain("credential private");
  });
});
