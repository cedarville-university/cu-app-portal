import { setMyGitHubUsernameInputSchema, setMyGitHubUsernameSchema, parseProfileInput } from "../profile/schemas";
import { portalMcpInputSchema, portalToolFailure, portalToolSuccess } from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

export function registerSetMyGitHubUsernameTool(server: PortalMcpServer, context: PortalMcpToolContext) {
  server.registerTool("set_my_github_username", {
    title: "Save My GitHub Username",
    description: "Save a user-supplied GitHub username to your own CU Launch profile for future apps and repository invitations. Read get_my_profile first; ask only if missing or the user requests a change. Never infer it from another identity. Use one stable idempotency UUID for this save and replay identical inputs after uncertain responses. This does not grant repository access or authenticate local Git.",
    inputSchema: portalMcpInputSchema(setMyGitHubUsernameInputSchema),
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async (input) => {
    try {
      const parsed = parseProfileInput(setMyGitHubUsernameSchema, input);
      const result = await context.executeIdempotentMutation({
        actorUserId: context.actor.userId,
        operation: "set_my_github_username",
        idempotencyKey: parsed.idempotencyKey,
        input: { githubUsername: parsed.githubUsername },
        expiresInSeconds: 604800,
        claimRateLimit: () => context.claimPortalRateLimit(context.actor.userId, "set_my_github_username"),
        execute: () => context.setMyGitHubUsername(context.actor, parsed.githubUsername),
      });
      return portalToolSuccess(result, "GitHub username saved in your CU Launch profile. Read get_my_profile for its current value.");
    } catch (error) { return portalToolFailure(error); }
  });
}
