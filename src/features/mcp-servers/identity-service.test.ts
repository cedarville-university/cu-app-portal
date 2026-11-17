// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ensureMcpIdentity, buildMcpRuntimeSettings } from "./identity-service";

const endpointUrl = "https://tools.azurewebsites.net/api/mcp";
function fixture() {
  const record: Record<string, unknown> = { appRequestId: "request-a", endpointUrl, tenantId: "tenant", applicationObjectId: null, applicationClientId: null, servicePrincipalId: null, scopeId: null, setupStatus: "NOT_STARTED", checkedAt: null };
  const save = vi.fn(async (patch) => Object.assign(record, patch));
  const release = vi.fn();
  const deps = {
    tenantId: "tenant", enabled: true, now: () => new Date("2026-11-16T12:00:00Z"),
    store: { claim: vi.fn(async () => ({ record, save, release, assertCurrent: vi.fn() })) },
    graph: {
      ensureApplication: vi.fn(async () => ({ applicationObjectId: "owned-app", applicationClientId: "resource-client", scopeId: "scope-a" })),
      ensureServicePrincipal: vi.fn(async () => "principal-a"),
      isReady: vi.fn(async () => false),
    },
  };
  return { deps, record, save, release };
}
describe("MCP resource reconciliation", () => {
  it("persists resource identifiers before dependent steps and blocks missing consent", async () => {
    const f = fixture();
    const result = await ensureMcpIdentity({ appId: "request-a", endpointUrl }, f.deps as never);
    expect(result.setupStatus).toBe("ACTION_REQUIRED");
    expect(f.save.mock.calls[0][0]).toMatchObject({ applicationObjectId: "owned-app", scopeId: "scope-a" });
    expect(f.release).toHaveBeenCalledOnce();
    expect(() => buildMcpRuntimeSettings(result)).toThrow();
  });
  it("makes no provider writes when automation is disabled", async () => {
    const f=fixture(); f.deps.enabled = false;
    await expect(ensureMcpIdentity({ appId: "request-a", endpointUrl }, f.deps as never)).rejects.toThrow(/pilot/i);
    expect(f.deps.graph.ensureApplication).not.toHaveBeenCalled();
  });
  it("retains the owned IDs on interruption and releases the lease", async () => {
    const f=fixture(); f.deps.graph.ensureServicePrincipal.mockRejectedValueOnce(new Error("secret provider text"));
    const result=await ensureMcpIdentity({ appId: "request-a", endpointUrl }, f.deps as never);
    expect(result).toMatchObject({ applicationObjectId: "owned-app", setupStatus: "ACTION_REQUIRED", failureCode: "MCP_IDENTITY_ACTION_REQUIRED" });
    expect(JSON.stringify(result)).not.toContain("secret provider text");
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("does not change the canonical identity on repair", async () => {
    const f=fixture(); f.record.endpointUrl = "https://other.azurewebsites.net/api/mcp";
    await expect(ensureMcpIdentity({ appId: "request-a", endpointUrl }, f.deps as never)).rejects.toThrow(/identity/i);
    expect(f.deps.graph.ensureApplication).not.toHaveBeenCalled();
  });
});
