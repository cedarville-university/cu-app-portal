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
    accessPurpose: z.enum(["invitation", "confirmation"]).optional().describe("Use invitation to send/resend an invite; confirmation to check after the user accepts. If omitted, inferred from the active grant record."),
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
      description: "Request actor-specific access to an app's managed GitHub repository using the username saved in get_my_profile. Call automatically after approved creation including repository access. INVITED requires the user to accept in GitHub; after confirmed acceptance call once with accessPurpose confirmation and a new UUID for a fresh check. Use accessPurpose invitation for an explicit resend. Reuse the same UUID for uncertain-response replays; do not loop while an invitation is pending. This does not authenticate local Git.",
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
        if (app.sourceOfTruth !== "PORTAL_MANAGED_REPO" && app.sourceOfTruth !== "IMPORTED_REPOSITORY") {
          throw new PortalApiError(
            "ACTION_REQUIRED",
            "Open CU Launch for this app workflow.",
          );
        }

        // Recheck identity even on a cached replay: a prior grant belongs to
        // the username used then, not a replacement saved on the profile.
        const profile = await context.getMyProfile(context.actor);
        if (
          !profile.githubUsername ||
          profile.githubUsername.trim().toLowerCase() !== input.githubUsername.trim().toLowerCase()
        ) {
          throw new PortalApiError(
            "ACTION_REQUIRED",
            "Read your current CU Launch profile and use its saved GitHub username before requesting repository access.",
          );
        }

        const mutationInput = {
          appId: input.appId,
          githubUsername: input.githubUsername,
          ...(input.accessPurpose ? { accessPurpose: input.accessPurpose } : {}),
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
              ...(input.accessPurpose ? { accessPurpose: input.accessPurpose } : {}),
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
