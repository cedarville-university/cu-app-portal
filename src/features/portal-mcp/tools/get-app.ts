import { z } from "zod";
import {
  portalMcpInputSchema,
  portalToolFailure,
  portalToolSuccess,
} from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

export const getAppToolInputSchema = z
  .object({ appId: z.string().min(1).max(128) })
  .strict();

const getAppMcpInputSchema = portalMcpInputSchema(getAppToolInputSchema);

type GetAppToolInput = z.infer<typeof getAppToolInputSchema>;

export function registerGetAppTool(
  server: PortalMcpServer,
  context: PortalMcpToolContext,
) {
  server.registerTool(
    "get_app",
    {
      title: "Get App",
      description: "Get the current safe summary for one accessible app.",
      inputSchema: getAppMcpInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input: GetAppToolInput) => {
      try {
        await context.claimPortalRateLimit(context.actor.userId, "read");
        const app = await context.getAccessibleAppSummary(
          context.actor,
          input.appId,
        );
        return portalToolSuccess({ app }, `Current status for ${app.appName}.`);
      } catch (error) {
        return portalToolFailure(error);
      }
    },
  );
}
