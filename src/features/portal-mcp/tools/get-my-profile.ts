import { getMyProfileSchema, parseProfileInput } from "../profile/schemas";
import { portalMcpInputSchema, portalToolFailure, portalToolSuccess } from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

export function registerGetMyProfileTool(server: PortalMcpServer, context: PortalMcpToolContext) {
  server.registerTool("get_my_profile", {
    title: "Get My CU Launch Profile",
    description: "Read your saved GitHub username, portal email, and display name. Use this before app creation or local Git setup; reuse a saved username without asking again. Reads only the signed-in user's current profile.",
    inputSchema: portalMcpInputSchema(getMyProfileSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    try {
      parseProfileInput(getMyProfileSchema, input);
      await context.claimPortalRateLimit(context.actor.userId, "read");
      const profile = await context.getMyProfile(context.actor);
      return portalToolSuccess({ profile }, "Your current CU Launch profile.");
    } catch (error) { return portalToolFailure(error); }
  });
}
