import { prisma } from "@/lib/db";
import { probeMcpDeployment } from "./deployment-probe";

export async function verifyMcpDeployment(appId: string, publishUrl: string) {
  const record=await prisma.appMcpConfiguration.findUniqueOrThrow({where:{appRequestId:appId}});
  if (new URL(record.endpointUrl).origin !== new URL(publishUrl).origin) throw new Error("MCP publish URL differs from its resource identity.");
  const attempt=await prisma.publishAttempt.findFirst({where:{appRequestId:appId,status:"RUNNING"},orderBy:{createdAt:"desc"},select:{id:true}});
  try {
    const probe=await probeMcpDeployment({endpointUrl:record.endpointUrl,tenantId:record.tenantId});
    await prisma.appMcpConfiguration.update({where:{appRequestId:appId},data:{probeStatus:probe.status,probeAttemptId:attempt?.id ?? null,probeCommitSha:null,probeCheckedAt:probe.checkedAt}});
    return {verifiedAt:probe.checkedAt,warningSummary:"MCP deployment checks passed. Authenticated host connection and tool verification are still required."};
  } catch (error) {
    await prisma.appMcpConfiguration.update({where:{appRequestId:appId},data:{probeStatus:"FAILED",probeAttemptId:attempt?.id ?? null,probeCommitSha:null,probeCheckedAt:new Date()}});
    throw error;
  }
}
