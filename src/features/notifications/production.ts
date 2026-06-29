import type { NotificationEventKey } from "@prisma/client";
import { loadSmtpConfig } from "./config";
import { createSmtpMailer } from "./mailer";
import { sendAppNotification } from "./service";

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
