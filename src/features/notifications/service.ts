import type { Prisma } from "@prisma/client";
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

const notificationPreferenceSelect = {
  emailNotificationsEnabled: true,
  collaborationEmailsEnabled: true,
  appLifecycleEmailsEnabled: true,
  publishingEmailsEnabled: true,
} as const;

const userRecipientSelect = {
  id: true,
  email: true,
  displayName: true,
  notificationPreference: {
    select: notificationPreferenceSelect,
  },
} as const;

const PREFERENCE_BYPASS_EVENTS = new Set<AppNotificationEventKey>([
  "COLLABORATION_INVITE_SENT",
  "COLLABORATION_INVITE_REVOKED",
  "APP_SHARED",
  "COLLABORATOR_REMOVED",
]);

export type SendAppNotificationInput = {
  appRequestId: string;
  eventKey: AppNotificationEventKey;
  actorUserId?: string;
  directRecipientUserIds?: string[];
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shouldApplyPreferences(eventKey: AppNotificationEventKey) {
  return !PREFERENCE_BYPASS_EVENTS.has(eventKey);
}

async function recordDeliverySafely(
  data: Prisma.NotificationDeliveryUncheckedCreateInput,
) {
  try {
    await prisma.notificationDelivery.create({ data });
  } catch (error) {
    console.error("Failed to record notification delivery.", error);
  }
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
  const appHref = `${appUrl.replace(/\/$/, "")}/download/${appRequestId}`;
  const escapedAppName = escapeHtml(appName);
  const escapedAppHref = escapeHtml(appHref);
  const subject = `App Portal update: ${appName}`;
  const text = [
    `${appName} has a portal update: ${eventKey.replaceAll("_", " ").toLowerCase()}.`,
    `View the app request: ${appHref}`,
  ].join("\n\n");
  const html = `<p>${escapedAppName} has a portal update.</p><p><a href="${escapedAppHref}">View the app request</a></p>`;

  return { subject, text, html };
}

export async function sendAppNotification({
  appRequestId,
  eventKey,
  actorUserId,
  directRecipientUserIds = [],
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
        select: userRecipientSelect,
      },
      collaborators: {
        select: {
          user: {
            select: userRecipientSelect,
          },
        },
      },
    },
  });

  if (!appRequest) {
    return;
  }

  const directRecipients =
    directRecipientUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: directRecipientUserIds } },
          select: userRecipientSelect,
        })
      : [];

  const recipients = uniqueRecipients([
    appRequest.user,
    ...appRequest.collaborators.map((collaborator) => collaborator.user),
    ...directRecipients,
  ]).filter(
    (recipient) =>
      recipient.id !== actorUserId ||
      directRecipientUserIds.includes(recipient.id),
  );

  const message = buildMessage({
    appName: appRequest.appName,
    appRequestId: appRequest.id,
    appUrl,
    eventKey,
  });

  for (const recipient of recipients) {
    if (
      shouldApplyPreferences(eventKey) &&
      !canReceiveNotificationCategory(
        recipient.notificationPreference,
        category,
      )
    ) {
      await recordDeliverySafely({
        appRequestId: appRequest.id,
        recipientUserId: recipient.id,
        recipientEmail: recipient.email,
        eventKey,
        category,
        status: "SKIPPED",
        provider: "smtp",
      });
      continue;
    }

    let result;

    try {
      result = await mailer.send({
        to: recipient.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      await recordDeliverySafely({
        appRequestId: appRequest.id,
        recipientUserId: recipient.id,
        recipientEmail: recipient.email,
        eventKey,
        category,
        status: "FAILED",
        provider: "smtp",
        errorSummary: summarizeError(error),
      });
      continue;
    }

    await recordDeliverySafely({
      appRequestId: appRequest.id,
      recipientUserId: recipient.id,
      recipientEmail: recipient.email,
      eventKey,
      category,
      status: "SENT",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      sentAt: new Date(),
    });
  }
}
