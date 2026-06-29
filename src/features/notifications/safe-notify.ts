import type { NotificationEventKey } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import {
  notifyAppEvent,
  notifyDeletedAppEventSnapshot,
} from "./production";
import type { DeletedAppNotificationRecipientSnapshot } from "./service";

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

export async function safeNotifyDeletedAppEvent(input: {
  appRequestId: string;
  appName: string;
  actorUserId?: string;
  recipients: DeletedAppNotificationRecipientSnapshot[];
}) {
  try {
    await notifyDeletedAppEventSnapshot(input);
  } catch (error) {
    console.error("Failed to send deleted app notification.", {
      appRequestId: input.appRequestId,
      eventKey: "APP_DELETED",
      error,
    });

    try {
      await recordAuditEvent("NOTIFICATION_DELIVERY_FAILED", {
        appRequestId: input.appRequestId,
        eventKey: "APP_DELETED",
        error: error instanceof Error ? error.message : "unknown",
      });
    } catch (auditError) {
      console.error("Failed to record notification failure audit event.", {
        appRequestId: input.appRequestId,
        eventKey: "APP_DELETED",
        error: auditError,
      });
    }
  }
}
