import { prisma } from "@/lib/db";
import {
  canReceiveNotificationCategory,
  type NotificationPreferenceSnapshot,
} from "./preferences";
import { NOTIFICATION_EVENT_CATEGORY, type AppNotificationEventKey } from "./types";
import type { Mailer } from "./mailer";

type NotificationRecipient = {
  id: string;
  email: string;
  displayName: string;
  notificationPreference?: NotificationPreferenceSnapshot | null;
};

export type SendAppNotificationInput = {
  appRequestId: string;
  eventKey: AppNotificationEventKey;
  actorUserId?: string;
  mailer: Mailer;
  appUrl: string;
};

function uniqueRecipients(recipients: NotificationRecipient[]) {
  const seen = new Set<string>();

  return recipients.filter((recipient) => {
    const key = recipient.email.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return "Notification delivery failed.";
}

function buildMessage({
  appName,
  appRequestId,
  appUrl,
  eventKey,
}: {
  appName: string;
  appRequestId: string;
  appUrl: string;
  eventKey: AppNotificationEventKey;
}) {
  const appHref = `${appUrl.replace(/\/$/, "")}/apps/${appRequestId}`;
  const subject = `App Portal update: ${appName}`;
  const text = [
    `${appName} has a portal update: ${eventKey.replaceAll("_", " ").toLowerCase()}.`,
    `View the app request: ${appHref}`,
  ].join("\n\n");
  const html = `<p>${appName} has a portal update.</p><p><a href="${appHref}">View the app request</a></p>`;

  return { subject, text, html };
}

export async function sendAppNotification({
  appRequestId,
  eventKey,
  actorUserId,
  mailer,
  appUrl,
}: SendAppNotificationInput) {
  const category = NOTIFICATION_EVENT_CATEGORY[eventKey];
  const appRequest = await prisma.appRequest.findUnique({
    where: { id: appRequestId },
    select: {
      id: true,
      appName: true,
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          notificationPreference: {
            select: {
              emailNotificationsEnabled: true,
              collaborationEmailsEnabled: true,
              appLifecycleEmailsEnabled: true,
              publishingEmailsEnabled: true,
            },
          },
        },
      },
      collaborators: {
        select: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              notificationPreference: {
                select: {
                  emailNotificationsEnabled: true,
                  collaborationEmailsEnabled: true,
                  appLifecycleEmailsEnabled: true,
                  publishingEmailsEnabled: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!appRequest) {
    return;
  }

  const recipients = uniqueRecipients([
    appRequest.user,
    ...appRequest.collaborators.map((collaborator) => collaborator.user),
  ]).filter((recipient) => recipient.id !== actorUserId);

  const message = buildMessage({
    appName: appRequest.appName,
    appRequestId: appRequest.id,
    appUrl,
    eventKey,
  });

  for (const recipient of recipients) {
    if (
      !canReceiveNotificationCategory(
        recipient.notificationPreference,
        category,
      )
    ) {
      await prisma.notificationDelivery.create({
        data: {
          appRequestId: appRequest.id,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          eventKey,
          category,
          status: "SKIPPED",
          provider: "smtp",
        },
      });
      continue;
    }

    try {
      const result = await mailer.send({
        to: recipient.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      await prisma.notificationDelivery.create({
        data: {
          appRequestId: appRequest.id,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          eventKey,
          category,
          status: "SENT",
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      await prisma.notificationDelivery.create({
        data: {
          appRequestId: appRequest.id,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          eventKey,
          category,
          status: "FAILED",
          provider: "smtp",
          errorSummary: summarizeError(error),
        },
      });
    }
  }
}
