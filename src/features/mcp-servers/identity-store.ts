import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { McpIdentityLease, McpIdentityRecord } from "./types";

export function createMcpIdentityStore(db = prisma) {
  return { async claim(appRequestId: string, endpointUrl: string, tenantId: string): Promise<McpIdentityLease> {
    await db.appMcpConfiguration.upsert({ where: { appRequestId }, create: { appRequestId, endpointUrl, tenantId }, update: {} });
    const leaseToken = randomUUID();
    const now = new Date();
    const claimed = await db.appMcpConfiguration.updateMany({ where: { appRequestId, OR: [{ leaseToken: null }, { leaseExpiresAt: { lt: now } }] }, data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + 120_000) } });
    if (claimed.count !== 1) throw new Error("MCP identity setup is already in progress.");
    const record = await db.appMcpConfiguration.findUniqueOrThrow({ where: { appRequestId } });
    return { record,
      async assertCurrent() {
        if (!await db.appMcpConfiguration.findFirst({where:{appRequestId,leaseToken,leaseExpiresAt:{gt:new Date()}},select:{appRequestId:true}})) throw new Error("MCP identity lease expired.");
      },
      async save(patch: Partial<McpIdentityRecord>) {
        // Immutable binding fields cannot be changed through reconciliation.
        const { applicationObjectId, applicationClientId, servicePrincipalId, scopeId, setupStatus, failureCode, checkedAt } = patch;
        const updated = await db.appMcpConfiguration.updateMany({ where: { appRequestId, leaseToken, leaseExpiresAt: { gt: new Date() } }, data: { applicationObjectId, applicationClientId, servicePrincipalId, scopeId, setupStatus, failureCode, checkedAt } });
        if (updated.count !== 1) throw new Error("MCP identity lease expired.");
        return db.appMcpConfiguration.findUniqueOrThrow({ where: { appRequestId } });
      },
      async release() { await db.appMcpConfiguration.updateMany({ where: { appRequestId, leaseToken }, data: { leaseToken: null, leaseExpiresAt: null } }); },
    };
  } };
}
