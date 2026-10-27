import { getAppEnvironmentSchema, parseEnvironmentInput, type GetAppEnvironmentInput } from "../environment/schemas";
import { portalMcpInputSchema, portalToolFailure, portalToolSuccess } from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

export function registerGetAppEnvironmentTool(server: PortalMcpServer, context: PortalMcpToolContext) {
  server.registerTool("get_app_environment", {
    title: "Get App Environment",
    description: "Read saved custom environment settings for an accessible app. Returns ordinary values and secret metadata only; sensitive values are withheld. Does not inspect live Azure configuration or read Key Vault secrets.",
    inputSchema: portalMcpInputSchema(getAppEnvironmentSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (input: GetAppEnvironmentInput) => {
    try {
      const parsed = parseEnvironmentInput(getAppEnvironmentSchema, input);
      await context.claimPortalRateLimit(context.actor.userId, "read");
      const result = await context.getAppEnvironment(context.actor, parsed);
      return portalToolSuccess(result, "Saved app environment settings. Secret and sensitive values are withheld.");
    } catch (error) { return portalToolFailure(error); }
  });
}
