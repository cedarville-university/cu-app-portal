"use server";

import { ClientSecretCredential } from "@azure/identity";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getServerSession } from "@/auth/session";
import { userHasAdminRole } from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { loadDirectoryConfig } from "@/features/directory/config";
import { createEntraDirectoryClient } from "@/features/directory/entra-directory";
import { loadSmtpConfig, type SmtpConfig } from "@/features/notifications/config";
import {
  createSmtpMailer,
  type Mailer,
  type MailSendResult,
} from "@/features/notifications/mailer";
import { recordAuditEvent, type AuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { createInviteToken, hashInviteToken } from "./tokens";

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MANAGE_INVITES_ERROR =
  "Only owners and admins can manage collaboration invites.";
const INVALID_INVITE_ERROR = "This collaboration invite is no longer valid.";
const INVITED_ACCOUNT_ERROR =
  "Sign in with the invited Cedarville account to accept this invite.";
const DIRECTORY_LOOKUP_UNAVAILABLE_ERROR =
  "The portal is unable to look up that email address right now.";
const EMAIL_REQUIRED_ERROR = "Email is required.";
const INELIGIBLE_INVITEE_ERROR =
  "Invitee must be an eligible Cedarville member.";
const UNVERIFIED_INVITE_DOMAIN_ERROR =
  "Invitee email must use the cedarville.edu domain.";

type InviteManagerContext = {
  actorUserId: string;
  actorUser: {
    displayName: string;
    email: string;
  };
  appRequest: {
    id: string;
    userId: string;
    appName: string;
    supportReference: string;
    user: {
      displayName: string;
      email: string;
    };
  };
};

type DeliveryResult =
  | { status: "SENT"; result: MailSendResult }
  | { status: "FAILED"; errorSummary: string };

type DeliveryStatus = DeliveryResult["status"];

export type CollaborationInviteFormState = {
  error: string | null;
  deliveryStatus: DeliveryStatus | null;
  unverifiedInviteEmail: string | null;
};

type InviteEmailInput = {
  inviterName: string;
  appName: string;
  acceptUrl: string;
};

type Invitee = {
  email: string;
  normalizedEmail: string;
  entraOid: string | null;
  displayName: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function allowedInviteEmailDomain() {
  return normalizeEmail(process.env.ENTRA_ALLOWED_EMAIL_DOMAIN ?? "cedarville.edu");
}

function hasAllowedInviteEmailDomain(email: string) {
  return normalizeEmail(email).endsWith(`@${allowedInviteEmailDomain()}`);
}

function addDaysFromNow() {
  return new Date(Date.now() + INVITE_TTL_MS);
}

function summarizeError(error: unknown, redactions: string[] = []) {
  let summary =
    error instanceof Error ? error.message : "Notification delivery failed.";

  for (const redaction of redactions.filter(Boolean)) {
    summary = summary.replaceAll(redaction, "[redacted]");
  }

  return summary.slice(0, 500);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isPendingInviteUniqueConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  const target = error.meta?.target;

  if (error.code !== "P2002") {
    return false;
  }

  if (target === "CollaborationInvite_pending_app_email_key") {
    return true;
  }

  if (!Array.isArray(target)) {
    return false;
  }

  return (
    target.includes("CollaborationInvite_pending_app_email_key") ||
    (target.includes("appRequestId") &&
      target.includes("normalizedInvitedEmail"))
  );
}

async function auditSafely(
  event: AuditEvent,
  details: Record<string, unknown>,
) {
  try {
    await recordAuditEvent(event, details);
  } catch (error) {
    console.error("Failed to record audit event.", error);
  }
}

async function recordDeliverySafely({
  appRequestId,
  recipientEmail,
  delivery,
}: {
  appRequestId: string;
  recipientEmail: string;
  delivery: DeliveryResult;
}) {
  try {
    await prisma.notificationDelivery.create({
      data: {
        appRequestId,
        recipientEmail,
        eventKey: "COLLABORATION_INVITE_SENT",
        category: "COLLABORATION",
        status: delivery.status,
        provider:
          delivery.status === "SENT" ? delivery.result.provider : "smtp",
        providerMessageId:
          delivery.status === "SENT"
            ? delivery.result.providerMessageId
            : undefined,
        sentAt: delivery.status === "SENT" ? new Date() : undefined,
        errorSummary:
          delivery.status === "FAILED" ? delivery.errorSummary : undefined,
      },
    });
  } catch (error) {
    console.error("Failed to record notification delivery.", error);
    await auditSafely("NOTIFICATION_DELIVERY_FAILED", {
      appRequestId,
      recipientEmail,
      error: summarizeError(error),
    });
  }
}

async function requireInviteManager(
  appRequestId: string,
): Promise<InviteManagerContext> {
  const actorUserId = await resolveCurrentUserId();
  const isAdmin = await userHasAdminRole(actorUserId);
  const appRequest = await prisma.appRequest.findFirst({
    where: isAdmin ? { id: appRequestId } : { id: appRequestId, userId: actorUserId },
    select: {
      id: true,
      userId: true,
      appName: true,
      supportReference: true,
      user: {
        select: {
          displayName: true,
          email: true,
        },
      },
    },
  });

  if (!appRequest) {
    throw new Error(MANAGE_INVITES_ERROR);
  }

  const actorUser = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      displayName: true,
      email: true,
    },
  });

  if (!actorUser) {
    throw new Error("Authenticated user not found.");
  }

  return { actorUserId, actorUser, appRequest };
}

function createGraphTokenProvider(config: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}) {
  return async () => {
    const credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret,
    );
    const token = await credential.getToken("https://graph.microsoft.com/.default");

    if (!token?.token) {
      throw new Error("Microsoft Graph token was not returned.");
    }

    return token.token;
  };
}

async function findEligibleInviteeByEmail(email: string) {
  try {
    const directoryConfig = loadDirectoryConfig();
    const directory = createEntraDirectoryClient({
      tokenProvider: createGraphTokenProvider(directoryConfig),
      allowedEmailDomain: directoryConfig.allowedEmailDomain,
    });

    return await directory.findEligibleUserByEmail(email);
  } catch (error) {
    console.error("Collaboration invite directory lookup failed.", error);
    throw new Error(DIRECTORY_LOOKUP_UNAVAILABLE_ERROR);
  }
}

function buildInviteMessage({
  inviterName,
  appName,
  acceptUrl,
}: InviteEmailInput) {
  const lines = [
    `${inviterName} invited you to collaborate on ${appName} in the Cedarville App Portal.`,
    `Accept the invitation: ${acceptUrl}`,
    "Accepting grants portal app access only. GitHub repository access is requested separately from the app details page.",
  ];
  const text = lines.join("\n\n");
  const html = lines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  return {
    subject: `${inviterName} invited you to collaborate on ${appName}`,
    text,
    html,
  };
}

function inviteFormErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const expectedMessages = new Set([
    MANAGE_INVITES_ERROR,
    DIRECTORY_LOOKUP_UNAVAILABLE_ERROR,
    EMAIL_REQUIRED_ERROR,
    INELIGIBLE_INVITEE_ERROR,
    UNVERIFIED_INVITE_DOMAIN_ERROR,
  ]);

  if (expectedMessages.has(message)) {
    return message;
  }

  console.error("Collaboration invite form submission failed.", error);

  return "The portal could not send that invite right now. Try again or contact support.";
}

function parseSubmittedInviteEmail(formData: FormData) {
  const submittedEmail = formData.get("email");

  if (typeof submittedEmail !== "string" || submittedEmail.trim().length === 0) {
    return null;
  }

  return normalizeEmail(submittedEmail);
}

function isDirectoryVerificationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message === DIRECTORY_LOOKUP_UNAVAILABLE_ERROR ||
    error.message === INELIGIBLE_INVITEE_ERROR
  );
}

function directoryVerificationPrompt(email: string) {
  return `The portal could not verify ${email} in Entra. You can send the invite without verification if you are sure the address is correct.`;
}

async function sendInviteEmail({
  mailer,
  smtpConfig,
  recipientEmail,
  inviterName,
  appName,
  token,
}: {
  mailer: Mailer;
  smtpConfig: SmtpConfig;
  recipientEmail: string;
  inviterName: string;
  appName: string;
  token: string;
}): Promise<DeliveryResult> {
  const appUrl = smtpConfig.appUrl.replace(/\/$/, "");
  const acceptUrl = `${appUrl}/invites/${token}`;
  const message = buildInviteMessage({
    inviterName,
    appName,
    acceptUrl,
  });

  try {
    const result = await mailer.send({
      to: recipientEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return { status: "SENT", result };
  } catch (error) {
    return {
      status: "FAILED",
      errorSummary: summarizeError(error, [acceptUrl, token]),
    };
  }
}

async function refreshPendingInvite({
  inviteId,
  appRequestId,
  tokenHash,
  expiresAt,
  lastSentAt,
  invitedEmail,
  invitedEntraOid,
  invitedDisplayName,
  inviterUserId,
}: {
  inviteId: string;
  appRequestId: string;
  tokenHash: string;
  expiresAt: Date;
  lastSentAt: Date;
  invitedEmail: string;
  invitedEntraOid: string | null;
  invitedDisplayName: string;
  inviterUserId: string;
}): Promise<{ id: string }> {
  const result = await prisma.collaborationInvite.updateMany({
    where: { id: inviteId, appRequestId, status: "PENDING" },
    data: {
      invitedEmail,
      invitedEntraOid,
      invitedDisplayName,
      inviterUserId,
      tokenHash,
      expiresAt,
      lastSentAt,
      acceptedAt: null,
      revokedAt: null,
    },
  });

  if (result.count !== 1) {
    throw new Error("Pending invite not found.");
  }

  return { id: inviteId };
}

async function restorePendingInviteTokenSafely({
  inviteId,
  appRequestId,
  failedAttemptTokenHash,
  tokenHash,
  expiresAt,
  lastSentAt,
}: {
  inviteId: string;
  appRequestId: string;
  failedAttemptTokenHash: string;
  tokenHash: string;
  expiresAt: Date;
  lastSentAt: Date | null;
}) {
  try {
    await prisma.collaborationInvite.updateMany({
      where: {
        id: inviteId,
        appRequestId,
        status: "PENDING",
        tokenHash: failedAttemptTokenHash,
      },
      data: {
        tokenHash,
        expiresAt,
        lastSentAt,
      },
    });
  } catch (error) {
    console.error("Failed to restore collaboration invite token.", error);
  }
}

export async function sendCollaborationInviteAction(
  appRequestId: string,
  formData: FormData,
) {
  const { actorUserId, actorUser, appRequest } =
    await requireInviteManager(appRequestId);
  const submittedEmail = formData.get("email");

  if (typeof submittedEmail !== "string" || submittedEmail.trim().length === 0) {
    throw new Error(EMAIL_REQUIRED_ERROR);
  }

  const normalizedEmail = normalizeEmail(submittedEmail);
  const eligibleUser = await findEligibleInviteeByEmail(normalizedEmail);

  if (!eligibleUser) {
    throw new Error(INELIGIBLE_INVITEE_ERROR);
  }

  return sendInviteToInvitee({
    actorUserId,
    actorUser,
    appRequest,
    invitee: {
      email: eligibleUser.email,
      normalizedEmail,
      entraOid: eligibleUser.entraOid,
      displayName: eligibleUser.displayName,
    },
  });
}

async function sendUnverifiedCollaborationInviteAction(
  appRequestId: string,
  formData: FormData,
) {
  const { actorUserId, actorUser, appRequest } =
    await requireInviteManager(appRequestId);
  const submittedEmail = formData.get("unverifiedEmail") ?? formData.get("email");

  if (typeof submittedEmail !== "string" || submittedEmail.trim().length === 0) {
    throw new Error(EMAIL_REQUIRED_ERROR);
  }

  const normalizedEmail = normalizeEmail(submittedEmail);

  if (!hasAllowedInviteEmailDomain(normalizedEmail)) {
    throw new Error(UNVERIFIED_INVITE_DOMAIN_ERROR);
  }

  return sendInviteToInvitee({
    actorUserId,
    actorUser,
    appRequest,
    invitee: {
      email: normalizedEmail,
      normalizedEmail,
      entraOid: null,
      displayName: normalizedEmail,
    },
  });
}

async function sendInviteToInvitee({
  actorUserId,
  actorUser,
  appRequest,
  invitee,
}: {
  actorUserId: string;
  actorUser: InviteManagerContext["actorUser"];
  appRequest: InviteManagerContext["appRequest"];
  invitee: Invitee;
}) {
  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = addDaysFromNow();
  const lastSentAt = new Date();
  const smtpConfig = loadSmtpConfig();
  const mailer = createSmtpMailer({ config: smtpConfig });
  const existingPendingInvite = await prisma.collaborationInvite.findFirst({
    where: {
      appRequestId: appRequest.id,
      normalizedInvitedEmail: invitee.normalizedEmail,
      status: "PENDING",
    },
  });

  let invite;
  let previousToken:
    | { tokenHash: string; expiresAt: Date; lastSentAt: Date | null }
    | null = null;

  if (existingPendingInvite) {
    previousToken = {
      tokenHash: existingPendingInvite.tokenHash,
      expiresAt: existingPendingInvite.expiresAt,
      lastSentAt: existingPendingInvite.lastSentAt,
    };
    invite = await refreshPendingInvite({
      inviteId: existingPendingInvite.id,
      appRequestId: appRequest.id,
      tokenHash,
      expiresAt,
      lastSentAt,
      invitedEmail: invitee.email,
      invitedEntraOid: invitee.entraOid,
      invitedDisplayName: invitee.displayName,
      inviterUserId: actorUserId,
    });
  } else {
    try {
      invite = await prisma.collaborationInvite.create({
        data: {
          appRequestId: appRequest.id,
          invitedEmail: invitee.email,
          normalizedInvitedEmail: invitee.normalizedEmail,
          invitedEntraOid: invitee.entraOid,
          invitedDisplayName: invitee.displayName,
          inviterUserId: actorUserId,
          status: "PENDING",
          tokenHash,
          expiresAt,
          lastSentAt,
        },
      });
    } catch (error) {
      if (!isPendingInviteUniqueConflict(error)) {
        throw error;
      }

      const pendingInvite = await prisma.collaborationInvite.findFirst({
        where: {
          appRequestId: appRequest.id,
          normalizedInvitedEmail: invitee.normalizedEmail,
          status: "PENDING",
        },
      });

      if (!pendingInvite) {
        throw error;
      }

      previousToken = {
        tokenHash: pendingInvite.tokenHash,
        expiresAt: pendingInvite.expiresAt,
        lastSentAt: pendingInvite.lastSentAt,
      };
      invite = await refreshPendingInvite({
        inviteId: pendingInvite.id,
        appRequestId: appRequest.id,
        tokenHash,
        expiresAt,
        lastSentAt,
        invitedEmail: invitee.email,
        invitedEntraOid: invitee.entraOid,
        invitedDisplayName: invitee.displayName,
        inviterUserId: actorUserId,
      });
    }
  }

  const delivery = await sendInviteEmail({
    mailer,
    smtpConfig,
    recipientEmail: invitee.email,
    inviterName: actorUser.displayName,
    appName: appRequest.appName,
    token,
  });

  if (delivery.status === "FAILED" && previousToken) {
    await restorePendingInviteTokenSafely({
      inviteId: invite.id,
      appRequestId: appRequest.id,
      failedAttemptTokenHash: tokenHash,
      ...previousToken,
    });
  }

  await recordDeliverySafely({
    appRequestId: appRequest.id,
    recipientEmail: invitee.email,
    delivery,
  });
  await auditSafely("COLLABORATION_INVITE_SENT", {
    actorUserId,
    appRequestId: appRequest.id,
    supportReference: appRequest.supportReference,
    inviteId: invite.id,
    targetEmail: invitee.email,
    inviterEmail: actorUser.email,
    inviterDisplayName: actorUser.displayName,
    deliveryStatus: delivery.status,
  });

  revalidatePath(`/download/${appRequest.id}`);

  return { deliveryStatus: delivery.status satisfies DeliveryStatus };
}

export async function sendCollaborationInviteFormAction(
  appRequestId: string,
  _state: CollaborationInviteFormState,
  formData: FormData,
): Promise<CollaborationInviteFormState> {
  try {
    const shouldSendUnverified = formData.get("sendUnverifiedInvite") === "true";
    const result = shouldSendUnverified
      ? await sendUnverifiedCollaborationInviteAction(appRequestId, formData)
      : await sendCollaborationInviteAction(appRequestId, formData);

    return {
      error: null,
      deliveryStatus: result.deliveryStatus,
      unverifiedInviteEmail: null,
    };
  } catch (error) {
    const submittedEmail = parseSubmittedInviteEmail(formData);

    if (submittedEmail && isDirectoryVerificationError(error)) {
      return {
        error: directoryVerificationPrompt(submittedEmail),
        deliveryStatus: null,
        unverifiedInviteEmail: submittedEmail,
      };
    }

    return {
      error: inviteFormErrorMessage(error),
      deliveryStatus: null,
      unverifiedInviteEmail:
        formData.get("unverifiedEmail")?.toString() ?? submittedEmail,
    };
  }
}

export async function revokeCollaborationInviteAction(
  appRequestId: string,
  inviteId: string,
) {
  const { actorUserId, appRequest } = await requireInviteManager(appRequestId);
  const invite = await prisma.collaborationInvite.update({
    where: {
      id: inviteId,
      appRequestId,
      status: "PENDING",
    },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      tokenHash: hashInviteToken(createInviteToken()),
    },
  });

  await auditSafely("COLLABORATION_INVITE_REVOKED", {
    actorUserId,
    appRequestId,
    supportReference: appRequest.supportReference,
    inviteId: invite.id,
  });
  revalidatePath(`/download/${appRequestId}`);
}

export async function resendCollaborationInviteAction(
  appRequestId: string,
  inviteId: string,
) {
  const { actorUserId, actorUser, appRequest } =
    await requireInviteManager(appRequestId);
  const invite = await prisma.collaborationInvite.findFirst({
    where: {
      id: inviteId,
      appRequestId,
      status: "PENDING",
    },
  });

  if (!invite) {
    throw new Error("Pending invite not found.");
  }

  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = addDaysFromNow();
  const lastSentAt = new Date();
  const refreshResult = await prisma.collaborationInvite.updateMany({
    where: { id: invite.id, appRequestId, status: "PENDING" },
    data: {
      tokenHash,
      expiresAt,
      lastSentAt,
    },
  });

  if (refreshResult.count !== 1) {
    throw new Error("Pending invite not found.");
  }

  const smtpConfig = loadSmtpConfig();
  const mailer = createSmtpMailer({ config: smtpConfig });
  const delivery = await sendInviteEmail({
    mailer,
    smtpConfig,
    recipientEmail: invite.invitedEmail,
    inviterName: actorUser.displayName,
    appName: appRequest.appName,
    token,
  });

  if (delivery.status === "FAILED") {
    await restorePendingInviteTokenSafely({
      inviteId: invite.id,
      appRequestId,
      failedAttemptTokenHash: tokenHash,
      tokenHash: invite.tokenHash,
      expiresAt: invite.expiresAt,
      lastSentAt: invite.lastSentAt,
    });
  }

  await recordDeliverySafely({
    appRequestId,
    recipientEmail: invite.invitedEmail,
    delivery,
  });
  await auditSafely("COLLABORATION_INVITE_RESENT", {
    actorUserId,
    appRequestId,
    supportReference: appRequest.supportReference,
    inviteId: invite.id,
    targetEmail: invite.invitedEmail,
    inviterEmail: actorUser.email,
    inviterDisplayName: actorUser.displayName,
    deliveryStatus: delivery.status,
  });
  revalidatePath(`/download/${appRequestId}`);

  return { deliveryStatus: delivery.status satisfies DeliveryStatus };
}

export async function acceptCollaborationInviteAction(token: string) {
  const session = await getServerSession();
  const sessionEntraOid = session?.user?.entraOid;
  const sessionEmail = session?.user?.email;

  if (!sessionEntraOid || !sessionEmail) {
    throw new Error(INVITED_ACCOUNT_ERROR);
  }

  const tokenHash = hashInviteToken(token);
  const invite = await prisma.collaborationInvite.findFirst({
    where: {
      tokenHash,
      status: "PENDING",
    },
  });

  if (!invite) {
    throw new Error(INVALID_INVITE_ERROR);
  }

  const now = new Date();

  if (invite.expiresAt <= now) {
    try {
      await prisma.collaborationInvite.updateMany({
        where: {
          id: invite.id,
          tokenHash,
          status: "PENDING",
          expiresAt: { lte: now },
        },
        data: {
          status: "EXPIRED",
        },
      });
    } catch (error) {
      console.error("Failed to mark collaboration invite expired.", error);
    }
    await auditSafely("COLLABORATION_INVITE_EXPIRED", {
      appRequestId: invite.appRequestId,
      inviteId: invite.id,
    });
    revalidatePath(`/download/${invite.appRequestId}`);
    throw new Error(INVALID_INVITE_ERROR);
  }

  const normalizedEmail = normalizeEmail(sessionEmail);

  if (
    invite.invitedEntraOid !== sessionEntraOid &&
    invite.normalizedInvitedEmail !== normalizedEmail
  ) {
    throw new Error(INVITED_ACCOUNT_ERROR);
  }

  const user = await prisma.user.upsert({
    where: { entraOid: sessionEntraOid },
    update: {
      email: normalizedEmail,
      displayName: session.user.name ?? normalizedEmail,
    },
    create: {
      entraOid: sessionEntraOid,
      email: normalizedEmail,
      displayName: session.user.name ?? normalizedEmail,
    },
  });

  const acceptedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const acceptResult = await tx.collaborationInvite.updateMany({
      where: {
        id: invite.id,
        tokenHash,
        status: "PENDING",
        expiresAt: { gt: acceptedAt },
      },
      data: {
        status: "ACCEPTED",
        invitedUserId: user.id,
        acceptedAt,
      },
    });

    if (acceptResult.count !== 1) {
      throw new Error(INVALID_INVITE_ERROR);
    }

    await tx.appAccess.upsert({
      where: {
        appRequestId_userId: {
          appRequestId: invite.appRequestId,
          userId: user.id,
        },
      },
      update: {},
      create: {
        appRequestId: invite.appRequestId,
        userId: user.id,
      },
    });
  });

  await auditSafely("COLLABORATION_INVITE_ACCEPTED", {
    actorUserId: user.id,
    appRequestId: invite.appRequestId,
    inviteId: invite.id,
  });
  revalidatePath(`/download/${invite.appRequestId}`);

  return invite.appRequestId;
}
