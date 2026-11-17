import { DefaultAzureCredential } from "@azure/identity";
import { prisma } from "@/lib/db";
import { createMcpIdentityClient } from "@/features/publishing/azure/mcp-identity-client";
import { createMcpIdentityStore } from "./identity-store";
import { buildMcpRuntimeSettings, ensureMcpIdentity } from "./identity-service";
import { deleteMcpIdentity } from "./delete-identity";

function client(authorizeMutation?: () => Promise<void>) {
  const credential = new DefaultAzureCredential();
  return createMcpIdentityClient({ clientIds: (process.env.AZURE_PUBLISH_MCP_CLIENT_IDS ?? "").split(",").map(x=>x.trim()).filter(Boolean), authorizeMutation, tokenProvider: async () => {
    const token=await credential.getToken("https://graph.microsoft.com/.default");
    if (!token) throw new Error("MCP identity provider sign-in is required.");
    return token.token;
  } });
}
export async function ensureDefaultMcpIdentity(input: { appId: string; endpointUrl: string; tenantId: string; authorizeProviderMutation?: () => Promise<void> }) {
  const record = await ensureMcpIdentity(input, { enabled: process.env.AZURE_PUBLISH_MCP_AUTOMATION_ENABLED === "true", tenantId: input.tenantId, now: () => new Date(), store: createMcpIdentityStore(), graph: client(input.authorizeProviderMutation) });
  return buildMcpRuntimeSettings(record);
}
export async function getMcpIdentitySettings(appId: string) {
  const record=await prisma.appMcpConfiguration.findUnique({where:{appRequestId:appId}});
  if (!record) throw new Error("MCP resource setup is required.");
  return buildMcpRuntimeSettings(record);
}
export async function deleteDefaultMcpIdentity(appId: string) {
  const record=await prisma.appMcpConfiguration.findUnique({where:{appRequestId:appId}});
  if (record) await deleteMcpIdentity(record,{store:createMcpIdentityStore(),graph:client()});
}
