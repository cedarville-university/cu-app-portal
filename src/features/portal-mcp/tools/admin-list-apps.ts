import { assertPortalAdmin } from "../admin/guard";
import { adminListAppsSchema, type AdminListAppsInput } from "../admin/schemas";
import { portalMcpInputSchema, portalToolSuccess, portalToolFailure } from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";
export function registerAdminListAppsTool(server: PortalMcpServer, context: PortalMcpToolContext) {
  server.registerTool("admin_list_apps", {
    title: "List All Apps", description: "List all CU Launch apps with optional search and owner filters. Portal administrator access is required.",
    inputSchema: portalMcpInputSchema(adminListAppsSchema),
    annotations: {
      readOnlyHint: true, destructiveHint: false, openWorldHint: false
    },
  }, async (input: AdminListAppsInput) => {
    try {
      assertPortalAdmin(context.actor);
      await context.claimPortalRateLimit(context.actor.userId, "read");
      const result = await context.adminListApps(context.actor, input);
      return portalToolSuccess(result, "Administrative apps retrieved.");
    }
    catch (error) {
      return portalToolFailure(error);
    }
  });
}
