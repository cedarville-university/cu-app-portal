import { z } from "zod";
import { PortalApiError } from "@/features/portal-api/errors";
import {
  portalMcpInputSchema,
  portalToolFailure,
  portalToolSuccess,
} from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

const IDEMPOTENCY_TTL_SECONDS = 604800;

export const repairPublishingSetupToolInputSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    appId: z.string().min(1).max(128),
  })
  .strict();

const repairPublishingSetupMcpInputSchema = portalMcpInputSchema(
  repairPublishingSetupToolInputSchema,
);

type RepairPublishingSetupToolInput = z.infer<
  typeof repairPublishingSetupToolInputSchema
>;

export function registerRepairPublishingSetupTool(
  server: PortalMcpServer,
  context: PortalMcpToolContext,
) {
  server.registerTool(
    "repair_publishing_setup",
    {
      title: "Repair Publishing Setup",
      description:
        "Refresh portal-managed publishing prerequisites without dispatching a deployment.",
      inputSchema: repairPublishingSetupMcpInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async (input: RepairPublishingSetupToolInput) => {
      try {
        const app = await context.getAccessibleAppSummary(
          context.actor,
          input.appId,
        );
        if (app.sourceOfTruth !== "PORTAL_MANAGED_REPO") {
          throw new PortalApiError(
            "ACTION_REQUIRED",
            "Open CU Launch for this app workflow.",
          );
        }

        const mutationInput = { appId: input.appId };
        const result = await context.executeIdempotentMutation({
          actorUserId: context.actor.userId,
          operation: "repair_publishing_setup",
          idempotencyKey: input.idempotencyKey,
          input: mutationInput,
          expiresInSeconds: IDEMPOTENCY_TTL_SECONDS,
          claimRateLimit: () =>
            context.claimPortalRateLimit(
              context.actor.userId,
              "repair_publishing_setup",
            ),
          execute: () =>
            context.repairPublishingSetupForActor({
              requestId: input.appId,
              actorUserId: context.actor.userId,
              source: "codex-mcp",
              portalOperation: "repair_publishing_setup",
              idempotencyKey: input.idempotencyKey,
            }),
          resultReferences: () => ({ appRequestId: input.appId }),
        });
        return portalToolSuccess(
          result,
          `Publishing setup status: ${result.status}. No deployment was dispatched.`,
        );
      } catch (error) {
        return portalToolFailure(error);
      }
    },
  );
}
