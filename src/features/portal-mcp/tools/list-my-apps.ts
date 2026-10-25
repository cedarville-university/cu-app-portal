import { z } from "zod";
import {
  portalMcpInputSchema,
  portalToolFailure,
  portalToolSuccess,
} from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

export const listMyAppsToolInputSchema = z.object({}).strict();

const listMyAppsMcpInputSchema = portalMcpInputSchema(
  listMyAppsToolInputSchema,
);

export function registerListMyAppsTool(
  server: PortalMcpServer,
  context: PortalMcpToolContext,
) {
  server.registerTool(
    "list_my_apps",
    {
      title: "List My Apps",
      description: "List concise summaries of apps owned by the signed-in actor, including administrators.",
      inputSchema: listMyAppsMcpInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        await context.claimPortalRateLimit(context.actor.userId, "read");
        const apps = await context.listOwnedAppSummaries(context.actor);
        return portalToolSuccess(
          { apps },
          `Found ${apps.length} owned app${apps.length === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        return portalToolFailure(error);
      }
    },
  );
}
