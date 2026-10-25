import { assertPortalAdmin } from "../admin/guard";
import { adminDebugAppSchema, type AdminDebugAppInput } from "../admin/schemas";
import { portalMcpInputSchema, portalToolSuccess, portalToolFailure } from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";
export function registerAdminDebugAppTool(server: PortalMcpServer, context: PortalMcpToolContext) {
  server.registerTool("admin_debug_app", {
    title: "Debug App", description: "Read recorded app diagnostics without changing resources. Portal administrator access is required.",
    inputSchema: portalMcpInputSchema(adminDebugAppSchema),
    annotations: {
      readOnlyHint: true, destructiveHint: false, openWorldHint: false
    },
  }, async (input: AdminDebugAppInput) => {
    try {
      assertPortalAdmin(context.actor);
      await context.claimPortalRateLimit(context.actor.userId, "read");
      const result = await context.adminDebugApp(context.actor, input);
      return portalToolSuccess({ diagnostics: result }, "Administrative diagnostics retrieved.");
    }
    catch (error) {
      return portalToolFailure(error);
    }
  });
}
