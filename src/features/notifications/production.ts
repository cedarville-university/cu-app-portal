import type { NotificationEventKey } from "@prisma/client";
import { loadSmtpConfig } from "./config";
import { createSmtpMailer } from "./mailer";
import {
  sendAppNotification,
  sendDeletedAppNotificationSnapshot,
  type DeletedAppNotificationRecipientSnapshot,
} from "./service";

export async function notifyAppEvent({
  appRequestId,
  eventKey,
  actorUserId,
  directRecipientUserIds,
}: {
  appRequestId: string;
  eventKey: NotificationEventKey;
  actorUserId?: string;
  directRecipientUserIds?: string[];
}) {
  const smtpConfig = loadSmtpConfig();
  const mailer = createSmtpMailer({ config: smtpConfig });

  await sendAppNotification({
    appRequestId,
    eventKey,
    actorUserId,
    directRecipientUserIds,
    mailer,
    appUrl: smtpConfig.appUrl,
  });
}

export async function notifyDeletedAppEventSnapshot({
  appRequestId,
  appName,
  actorUserId,
  recipients,
}: {
  appRequestId: string;
  appName: string;
  actorUserId?: string;
  recipients: DeletedAppNotificationRecipientSnapshot[];
}) {
  const smtpConfig = loadSmtpConfig();
  const mailer = createSmtpMailer({ config: smtpConfig });

  await sendDeletedAppNotificationSnapshot({
    appRequestId,
    appName,
    actorUserId,
    recipients,
    mailer,
    appUrl: smtpConfig.appUrl,
  });
}
