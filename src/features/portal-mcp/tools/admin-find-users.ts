import { assertPortalAdmin } from "../admin/guard";
import { adminFindUsersSchema, type AdminFindUsersInput } from "../admin/schemas";
import { portalMcpInputSchema, portalToolSuccess, portalToolFailure } from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";
export function registerAdminFindUsersTool(server: PortalMcpServer, context: PortalMcpToolContext) {
  server.registerTool("admin_find_users", {
    title: "Find Portal Users", description: "Find CU Launch users by name, email or GitHub username. username is derived from the email prefix. Portal administrator access is required.",
    inputSchema: portalMcpInputSchema(adminFindUsersSchema),
    annotations: {
      readOnlyHint: true, destructiveHint: false, openWorldHint: false
    },
  }, async (input: AdminFindUsersInput) => {
    try {
      assertPortalAdmin(context.actor);
      await context.claimPortalRateLimit(context.actor.userId, "read");
      const result = await context.adminFindUsers(context.actor, input);
      return portalToolSuccess(result, "Administrative users retrieved.");
    }
    catch (error) {
      return portalToolFailure(error);
    }
  });
}
