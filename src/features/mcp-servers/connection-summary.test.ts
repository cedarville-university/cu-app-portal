import { describe, expect, it } from "vitest";
import { buildMcpConnectionSummary } from "./connection-summary";
describe("MCP connection summary",()=>{
  it("does not invent an endpoint for unpublished or unconfigured apps",()=>{
    expect(buildMcpConnectionSummary(null,{published:false})).toBeNull();
    expect(buildMcpConnectionSummary({endpointUrl:"https://tools.azurewebsites.net/api/mcp",tenantId:"tenant",setupStatus:"ACTION_REQUIRED",checkedAt:null} as never,{published:true})?.endpointUrl).toBeNull();
  });
  it("returns only nonsecret connection data with historical probe evidence",()=>{
    const result=buildMcpConnectionSummary({endpointUrl:"https://tools.azurewebsites.net/api/mcp",tenantId:"tenant",setupStatus:"READY",checkedAt:null,probeStatus:"PASSED",leaseToken:"private"} as never,{published:true});
    expect(result).toMatchObject({endpointUrl:"https://tools.azurewebsites.net/api/mcp",clientVerification:"REQUIRED",deploymentProbe:{status:"PASSED",currency:"HISTORICAL_ONLY"}});
    expect(result).not.toHaveProperty("leaseToken");
  });
});
