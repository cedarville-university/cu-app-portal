import { z } from "zod";
import { PortalApiError } from "@/features/portal-api/errors";
import {
  portalMcpInputSchema,
  portalToolFailure,
  portalToolSuccess,
} from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

const IDEMPOTENCY_TTL_SECONDS = 604800;

export const publishAppToAzureToolInputSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    appId: z.string().min(1).max(128),
  })
  .strict();

const publishAppToAzureMcpInputSchema = portalMcpInputSchema(
  publishAppToAzureToolInputSchema,
);

type PublishAppToAzureToolInput = z.infer<
  typeof publishAppToAzureToolInputSchema
>;

export function registerPublishAppToAzureTool(
  server: PortalMcpServer,
  context: PortalMcpToolContext,
) {
  server.registerTool(
    "publish_app_to_azure",
    {
      title: "Publish App to Azure",
      description: "Queue an explicit initial publish or republish to Azure.",
      inputSchema: publishAppToAzureMcpInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (input: PublishAppToAzureToolInput) => {
      try {
        const app = await context.getAccessibleAppSummary(
          context.actor,
          input.appId,
        );
        if (app.sourceOfTruth !== "PORTAL_MANAGED_REPO") {
          throw new PortalApiError(
            "ACTION_REQUIRED",
            "Open the Cedarville App Portal for this app workflow.",
          );
        }

        const mutationInput = { appId: input.appId };
        const result = await context.executeIdempotentMutation({
          actorUserId: context.actor.userId,
          operation: "publish_app_to_azure",
          idempotencyKey: input.idempotencyKey,
          input: mutationInput,
          expiresInSeconds: IDEMPOTENCY_TTL_SECONDS,
          claimRateLimit: () =>
            context.claimPortalRateLimit(
              context.actor.userId,
              "publish_app_to_azure",
            ),
          execute: () =>
            context.queuePublishForActor({
              requestId: input.appId,
              actorUserId: context.actor.userId,
              source: "codex-mcp",
            }),
        });
        return portalToolSuccess(
          result,
          "Publishing was queued. Check the publish status for progress.",
        );
      } catch (error) {
        return portalToolFailure(error);
      }
    },
  );
}
