import type { NotificationEventKey } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { notifyAppEvent } from "./production";

export async function safeNotifyAppEvent(input: {
  appRequestId: string;
  eventKey: NotificationEventKey;
  actorUserId?: string;
  directRecipientUserIds?: string[];
}) {
  try {
    await notifyAppEvent(input);
  } catch (error) {
    console.error("Failed to send app notification.", {
      appRequestId: input.appRequestId,
      eventKey: input.eventKey,
      error,
    });

    try {
      await recordAuditEvent("NOTIFICATION_DELIVERY_FAILED", {
        appRequestId: input.appRequestId,
        eventKey: input.eventKey,
        error: error instanceof Error ? error.message : "unknown",
      });
    } catch (auditError) {
      console.error("Failed to record notification failure audit event.", {
        appRequestId: input.appRequestId,
        eventKey: input.eventKey,
        error: auditError,
      });
    }
  }
}
