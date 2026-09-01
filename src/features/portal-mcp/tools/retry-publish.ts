import { z } from "zod";
import { PortalApiError } from "@/features/portal-api/errors";
import {
  portalMcpInputSchema,
  portalToolFailure,
  portalToolSuccess,
} from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

const IDEMPOTENCY_TTL_SECONDS = 604800;

export const retryPublishToolInputSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    appId: z.string().min(1).max(128),
  })
  .strict();

const retryPublishMcpInputSchema = portalMcpInputSchema(
  retryPublishToolInputSchema,
);

type RetryPublishToolInput = z.infer<typeof retryPublishToolInputSchema>;

export function registerRetryPublishTool(
  server: PortalMcpServer,
  context: PortalMcpToolContext,
) {
  server.registerTool(
    "retry_publish",
    {
      title: "Retry Publish",
      description: "Queue a new publish attempt for an explicitly approved failed publish.",
      inputSchema: retryPublishMcpInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (input: RetryPublishToolInput) => {
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
          operation: "retry_publish",
          idempotencyKey: input.idempotencyKey,
          input: mutationInput,
          expiresInSeconds: IDEMPOTENCY_TTL_SECONDS,
          claimRateLimit: () =>
            context.claimPortalRateLimit(context.actor.userId, "retry_publish"),
          execute: () =>
            context.retryPublishForActor({
              requestId: input.appId,
              actorUserId: context.actor.userId,
              source: "codex-mcp",
            }),
        });
        return portalToolSuccess(
          result,
          "The publish retry was queued. Check the new attempt status for progress.",
        );
      } catch (error) {
        return portalToolFailure(error);
      }
    },
  );
}
