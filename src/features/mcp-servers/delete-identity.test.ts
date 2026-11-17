// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { deleteMcpIdentity } from "./delete-identity";
describe("owned MCP identity removal",()=>{
  it("retires persisted IDs only after provider removal and releases the lease",async()=>{
    const record={appRequestId:"app",endpointUrl:"https://a.azurewebsites.net/api/mcp",tenantId:"tenant",applicationObjectId:"owned-app"};
    const save=vi.fn(async(patch)=>Object.assign(record,patch)); const release=vi.fn(); const assertCurrent=vi.fn();
    const deleteOwnedApplication=vi.fn(async()=>{expect(record.applicationObjectId).toBe("owned-app");});
    const store={claim:vi.fn(async()=>({record,save,release,assertCurrent}))};
    await deleteMcpIdentity(record as never,{store,graph:{deleteOwnedApplication}} as never);
    expect(deleteOwnedApplication).toHaveBeenCalledWith("app","owned-app");
    expect(record).toMatchObject({applicationObjectId:null,applicationClientId:null,servicePrincipalId:null,scopeId:null,setupStatus:"REMOVED"});
    expect(release).toHaveBeenCalledOnce();
  });
  it("retains IDs when ownership-checked deletion fails",async()=>{
    const record={appRequestId:"app",endpointUrl:"https://a.azurewebsites.net/api/mcp",tenantId:"tenant",applicationObjectId:"owned-app"};
    const save=vi.fn(); const release=vi.fn();
    const store={claim:vi.fn(async()=>({record,save,release,assertCurrent:vi.fn()}))};
    await expect(deleteMcpIdentity(record as never,{store,graph:{deleteOwnedApplication:vi.fn().mockRejectedValue(new Error("ownership mismatch"))}} as never)).rejects.toThrow(/ownership/);
    expect(save).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce();
  });
});
