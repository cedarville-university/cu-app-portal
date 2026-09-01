import { z } from "zod";
import {
  portalMcpInputSchema,
  portalToolFailure,
  portalToolSuccess,
} from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

export const listAppTemplatesToolInputSchema = z.object({}).strict();

const listAppTemplatesMcpInputSchema = portalMcpInputSchema(
  listAppTemplatesToolInputSchema,
);

export function registerListAppTemplatesTool(
  server: PortalMcpServer,
  context: PortalMcpToolContext,
) {
  server.registerTool(
    "list_app_templates",
    {
      title: "List App Templates",
      description: "List the active Cedarville app templates and caller-selectable choices.",
      inputSchema: listAppTemplatesMcpInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        await context.claimPortalRateLimit(context.actor.userId, "read");
        const templates = context.listPortalTemplateSummaries();
        return portalToolSuccess(
          { templates },
          `Found ${templates.length} active app template${templates.length === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        return portalToolFailure(error);
      }
    },
  );
}
