"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { recoverPublishAttempt } from "@/features/publishing/recovery";
import { requireAdminUserId } from "./roles";

export type PublishingAdminResult = { message: string; error?: boolean };
export async function updatePublishingStateAction(
  appRequestId: string,
  _previous: PublishingAdminResult,
  form: FormData,
): Promise<PublishingAdminResult> {
  try {
    const actorUserId = await requireAdminUserId();
    const operation = form.get("operation");
    if (!["reconcile", "fail", "reset-setup", "clear-errors"].includes(String(operation))) throw new Error("Choose a supported recovery action.");
    const reason = String(form.get("reason") ?? "").trim();
    if (reason.length > 500) throw new Error("Keep the reason under 500 characters.");
    if (["fail", "reset-setup"].includes(String(operation))) {
      if (reason.length < 5 || form.get("confirmStopped") !== "on") throw new Error("Provide a reason and confirm that the interrupted worker has stopped.");
    }
    const app = await prisma.appRequest.findUnique({
      where: { id: appRequestId },
      include: { publishAttempts: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } },
    });
    if (!app) throw new Error("App not found.");
    let message: string;
    if (operation === "reconcile" || operation === "fail") {
      const attempt = app.publishAttempts[0];
      if (!attempt) throw new Error("There is no publishing attempt to recover.");
      const result = await recoverPublishAttempt(attempt.id, { actorUserId, markFailed: operation === "fail", reason: reason || undefined });
      const messages = {
        succeeded: "Deployment and health verified. The portal now records this app as published.",
        failed: "The abandoned attempt is closed as failed. Publishing can be retried from the app page.",
        requeued: "The queued attempt has been sent to the durable worker again.",
        waiting: "GitHub deployment or app startup is still in progress. The recovery check will inspect it again.",
        review: "The recorded evidence cannot verify this deployment. Review GitHub before correcting the abandoned attempt.",
        busy: "The worker lease is still active or this attempt is too recent to recover.",
        settled: "This attempt has already finished or a newer attempt has replaced it.",
      };
      message = messages[result];
    } else {
      if (["QUEUED", "PROVISIONING", "DEPLOYING"].includes(app.publishStatus)) throw new Error("Recover the running publish attempt before changing setup or error notes.");
      if (operation === "reset-setup" && ["CHECKING", "REPAIRING"].includes(app.publishingSetupStatus) && Date.now() - app.updatedAt.getTime() < 30 * 60_000) {
        throw new Error("The setup check is too recent to reset. Wait for it to finish or become stale.");
      }
      const data = operation === "reset-setup"
        ? { publishingSetupStatus: "NEEDS_REPAIR" as const, publishingSetupErrorSummary: reason }
        : { publishErrorSummary: null, publishingSetupErrorSummary: null };
      const changed = await prisma.appRequest.updateMany({ where: { id: app.id, updatedAt: app.updatedAt, publishStatus: app.publishStatus, publishingSetupStatus: app.publishingSetupStatus }, data });
      if (changed.count !== 1) throw new Error("The app changed while you were reviewing it. Refresh and try again.");
      await recordAuditEvent("ADMIN_APP_STATE_UPDATED", { actorUserId, appRequestId, supportReference: app.supportReference, operation, reason, previousPublishStatus: app.publishStatus, previousSetupStatus: app.publishingSetupStatus, ...data });
      message = operation === "reset-setup" ? "Publishing setup now needs repair. Use Repair Publishing Setup on the app page." : "Old publishing error notes cleared.";
    }
    for (const path of ["/admin/apps", `/admin/apps/${appRequestId}`, "/apps", `/download/${appRequestId}`, `/onboarding/${appRequestId}`]) revalidatePath(path);
    return { message };
  } catch (error) {
    console.error("Admin publishing recovery failed.", { appRequestId });
    return { message: error instanceof Error ? error.message : "Publishing recovery could not be completed.", error: true };
  }
}
