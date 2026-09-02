import { z } from "zod";
import { PortalApiError } from "@/features/portal-api/errors";
import {
  portalMcpInputSchema,
  portalToolFailure,
  portalToolSuccess,
} from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

const IDEMPOTENCY_TTL_SECONDS = 604800;

export const requestGitHubAccessToolInputSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    appId: z.string().min(1).max(128),
    githubUsername: z.string().min(1).max(39),
  })
  .strict();

const requestGitHubAccessMcpInputSchema = portalMcpInputSchema(
  requestGitHubAccessToolInputSchema,
);

type RequestGitHubAccessToolInput = z.infer<
  typeof requestGitHubAccessToolInputSchema
>;

export function registerRequestGitHubAccessTool(
  server: PortalMcpServer,
  context: PortalMcpToolContext,
) {
  server.registerTool(
    "request_github_access",
    {
      title: "Request GitHub Access",
      description: "Request actor-specific access to an app's managed GitHub repository.",
      inputSchema: requestGitHubAccessMcpInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (input: RequestGitHubAccessToolInput) => {
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

        const mutationInput = {
          appId: input.appId,
          githubUsername: input.githubUsername,
        };
        const result = await context.executeIdempotentMutation({
          actorUserId: context.actor.userId,
          operation: "request_github_access",
          idempotencyKey: input.idempotencyKey,
          input: mutationInput,
          expiresInSeconds: IDEMPOTENCY_TTL_SECONDS,
          claimRateLimit: () =>
            context.claimPortalRateLimit(
              context.actor.userId,
              "request_github_access",
            ),
          execute: () =>
            context.grantRepositoryAccessForActor({
              requestId: input.appId,
              actorUserId: context.actor.userId,
              githubUsername: input.githubUsername,
              source: "codex-mcp",
              portalOperation: "request_github_access",
              idempotencyKey: input.idempotencyKey,
            }),
          resultReferences: () => ({ appRequestId: input.appId }),
        });
        return portalToolSuccess(result, result.note);
      } catch (error) {
        return portalToolFailure(error);
      }
    },
  );
}
