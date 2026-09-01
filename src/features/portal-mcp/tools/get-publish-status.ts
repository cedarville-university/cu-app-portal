import { z } from "zod";
import {
  portalMcpInputSchema,
  portalToolFailure,
  portalToolSuccess,
} from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

export const getPublishStatusToolInputSchema = z
  .object({ attemptId: z.string().min(1).max(128) })
  .strict();

const getPublishStatusMcpInputSchema = portalMcpInputSchema(
  getPublishStatusToolInputSchema,
);

type GetPublishStatusToolInput = z.infer<
  typeof getPublishStatusToolInputSchema
>;

export function registerGetPublishStatusTool(
  server: PortalMcpServer,
  context: PortalMcpToolContext,
) {
  server.registerTool(
    "get_publish_status",
    {
      title: "Get Publish Status",
      description: "Get the safe current state of an accessible publish attempt.",
      inputSchema: getPublishStatusMcpInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input: GetPublishStatusToolInput) => {
      try {
        await context.claimPortalRateLimit(context.actor.userId, "read");
        const attempt = await context.getAccessiblePublishAttemptSummary(
          context.actor,
          input.attemptId,
        );
        const app = await context.getAccessibleAppSummary(
          context.actor,
          attempt.appId,
        );
        return portalToolSuccess(
          {
            ...attempt,
            supportReference: app.supportReference,
            liveUrl: app.liveUrl,
            allowedNextActions: app.allowedNextActions,
          },
          `Publish status: ${attempt.status}; stage: ${attempt.stage}.`,
        );
      } catch (error) {
        return portalToolFailure(error);
      }
    },
  );
}
