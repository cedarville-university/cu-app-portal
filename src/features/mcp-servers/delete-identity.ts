import type { McpIdentityLease, McpIdentityRecord } from "./types";

export async function deleteMcpIdentity(record: McpIdentityRecord, deps: {
  store: { claim(appId:string,endpointUrl:string,tenantId:string):Promise<McpIdentityLease> };
  graph: { deleteOwnedApplication(appId:string,applicationObjectId:string):Promise<void> };
}) {
  const lease=await deps.store.claim(record.appRequestId,record.endpointUrl,record.tenantId);
  try {
    await lease.assertCurrent();
    if (lease.record.applicationObjectId) await deps.graph.deleteOwnedApplication(record.appRequestId,lease.record.applicationObjectId);
    await lease.save({applicationObjectId:null,applicationClientId:null,servicePrincipalId:null,scopeId:null,setupStatus:"REMOVED",failureCode:"MCP_IDENTITY_REMOVED",checkedAt:new Date()});
  } finally { await lease.release(); }
}
