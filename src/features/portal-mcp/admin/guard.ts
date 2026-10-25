import type { PortalActor } from "@/features/portal-api/principal";
import { PortalApiError } from "@/features/portal-api/errors";
export function assertPortalAdmin(actor: PortalActor): void {
  if (!actor.isAdmin)
    throw new PortalApiError("FORBIDDEN", "Portal administrator access is required.");
}
