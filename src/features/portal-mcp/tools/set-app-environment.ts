import { setAppEnvironmentSchema, parseEnvironmentInput, type SetAppEnvironmentInput } from "../environment/schemas";
import { portalMcpInputSchema, portalToolFailure, portalToolSuccess } from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

export function registerSetAppEnvironmentTool(server: PortalMcpServer, context: PortalMcpToolContext) {
  server.registerTool("set_app_environment", {
    title: "Set App Environment",
    description: "Add or replace 1–100 ordinary environment variables in one batch for an accessible app. Published apps receive one Azure settings update and may briefly restart. Secrets, sensitive settings, and portal-managed settings cannot be changed. Never supply credentials; use CU Launch for secret entry or replacement. One stable UUID per batch supports replay after uncertain responses.",
    inputSchema: portalMcpInputSchema(setAppEnvironmentSchema),
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async (input: SetAppEnvironmentInput) => {
    try {
      const parsed = parseEnvironmentInput(setAppEnvironmentSchema, input);
      // Cached results also require current app access. The service checks again
      // on actual execution before reading variables or constructing providers.
      await context.authorizeEnvironmentApp(context.actor, parsed.appId);
      const result = await context.executeIdempotentMutation({
        actorUserId: context.actor.userId,
        operation: "set_app_environment",
        idempotencyKey: parsed.idempotencyKey,
        input: { appId: parsed.appId, variables: parsed.variables },
        expiresInSeconds: 604800,
        claimRateLimit: () => context.claimPortalRateLimit(context.actor.userId, "set_app_environment"),
        execute: () => context.setAppEnvironment(context.actor, parsed),
        resultReferences: () => ({ appRequestId: parsed.appId }),
      });
      return portalToolSuccess(result, result.application === "live_settings_update"
        ? "Environment batch saved with one Azure settings update. The live app may briefly restart."
        : "Environment batch saved for the next publish.");
    } catch (error) { return portalToolFailure(error); }
  });
}
