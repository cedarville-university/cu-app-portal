import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  canReceiveNotificationCategory,
  type NotificationPreferenceSnapshot,
} from "./preferences";
import { renderAppEventEmail, type AppEventEmailContext } from "./templates";
import { NOTIFICATION_EVENT_CATEGORY, type AppNotificationEventKey } from "./types";
import type { Mailer } from "./mailer";

type NotificationRecipient = {
  id: string;
  email: string;
  displayName: string;
  notificationPreference?: NotificationPreferenceSnapshot | null;
};

export type DeletedAppNotificationRecipientSnapshot = NotificationRecipient;

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
      supportReference: true,
      repositoryName: true,
      repositoryUrl: true,
      publishUrl: true,
      publishErrorSummary: true,
      publishingSetupErrorSummary: true,
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

  const actor = actorUserId
    ? await prisma.user.findUnique({
        where: { id: actorUserId },
        select: { displayName: true },
      })
    : null;
  const portalUrl = appUrl.replace(/\/$/, "");
  const baseContext: Omit<AppEventEmailContext, "recipientDisplayName"> = {
    eventKey,
    appName: appRequest.appName,
    portalUrl,
    appHref: `${portalUrl}/download/${appRequest.id}`,
    actorDisplayName: actor?.displayName ?? null,
    publishUrl: appRequest.publishUrl,
    publishErrorSummary: appRequest.publishErrorSummary,
    publishingSetupErrorSummary: appRequest.publishingSetupErrorSummary,
    repositoryName: appRequest.repositoryName,
    repositoryUrl: appRequest.repositoryUrl,
    supportReference: appRequest.supportReference,
  };

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

    const message = renderAppEventEmail({
      ...baseContext,
      recipientDisplayName: recipient.displayName,
    });

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

export async function sendDeletedAppNotificationSnapshot({
  appRequestId,
  appName,
  actorUserId,
  recipients,
  mailer,
  appUrl,
}: {
  appRequestId: string;
  appName: string;
  actorUserId?: string;
  recipients: DeletedAppNotificationRecipientSnapshot[];
  mailer: Mailer;
  appUrl: string;
}) {
  const eventKey: AppNotificationEventKey = "APP_DELETED";
  const category = NOTIFICATION_EVENT_CATEGORY[eventKey];
  const directRecipientUserIds = recipients.map((recipient) => recipient.id);
  const snapshotRecipients = uniqueRecipients(recipients).filter(
    (recipient) =>
      recipient.id !== actorUserId ||
      directRecipientUserIds.includes(recipient.id),
  );
  const actor = actorUserId
    ? await prisma.user.findUnique({
        where: { id: actorUserId },
        select: { displayName: true },
      })
    : null;
  const baseContext: Omit<AppEventEmailContext, "recipientDisplayName"> = {
    eventKey,
    appName,
    portalUrl: appUrl,
    appHref: null,
    actorDisplayName: actor?.displayName ?? null,
  };

  for (const recipient of snapshotRecipients) {
    if (
      shouldApplyPreferences(eventKey) &&
      !canReceiveNotificationCategory(
        recipient.notificationPreference,
        category,
      )
    ) {
      await recordDeliverySafely({
        appRequestId: null,
        recipientUserId: recipient.id,
        recipientEmail: recipient.email,
        eventKey,
        category,
        status: "SKIPPED",
        provider: "smtp",
      });
      continue;
    }

    const message = renderAppEventEmail({
      ...baseContext,
      recipientDisplayName: recipient.displayName,
    });

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
        appRequestId: null,
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
      appRequestId: null,
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
