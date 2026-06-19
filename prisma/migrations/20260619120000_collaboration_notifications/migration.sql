CREATE TYPE "CollaborationInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "NotificationCategory" AS ENUM ('COLLABORATION', 'APP_LIFECYCLE', 'PUBLISHING');
CREATE TYPE "NotificationEventKey" AS ENUM (
  'COLLABORATION_INVITE_SENT',
  'COLLABORATION_INVITE_ACCEPTED',
  'COLLABORATION_INVITE_REVOKED',
  'APP_SHARED',
  'COLLABORATOR_REMOVED',
  'APP_CREATED',
  'EXISTING_APP_IMPORTED',
  'REPOSITORY_READY',
  'REPOSITORY_FAILED',
  'APP_DELETED',
  'PUBLISHING_SETUP_NEEDS_REPAIR',
  'PUBLISHING_SETUP_BLOCKED',
  'PUBLISH_SUCCEEDED',
  'PUBLISH_FAILED',
  'OWNER_REASSIGNED'
);
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "CollaborationInvite" (
  "id" TEXT NOT NULL,
  "appRequestId" TEXT NOT NULL,
  "invitedEmail" TEXT NOT NULL,
  "normalizedInvitedEmail" TEXT NOT NULL,
  "invitedEntraOid" TEXT NOT NULL,
  "invitedDisplayName" TEXT NOT NULL,
  "invitedUserId" TEXT,
  "inviterUserId" TEXT NOT NULL,
  "status" "CollaborationInviteStatus" NOT NULL DEFAULT 'PENDING',
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "collaborationEmailsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "appLifecycleEmailsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "publishingEmailsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "appRequestId" TEXT,
  "recipientUserId" TEXT,
  "recipientEmail" TEXT NOT NULL,
  "eventKey" "NotificationEventKey" NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL,
  "provider" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "errorSummary" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollaborationInvite_tokenHash_key" ON "CollaborationInvite"("tokenHash");
CREATE UNIQUE INDEX "CollaborationInvite_pending_app_email_key" ON "CollaborationInvite"("appRequestId", "normalizedInvitedEmail") WHERE "status" = 'PENDING';
CREATE INDEX "CollaborationInvite_appRequestId_idx" ON "CollaborationInvite"("appRequestId");
CREATE INDEX "CollaborationInvite_normalizedInvitedEmail_idx" ON "CollaborationInvite"("normalizedInvitedEmail");
CREATE INDEX "CollaborationInvite_inviterUserId_idx" ON "CollaborationInvite"("inviterUserId");
CREATE INDEX "CollaborationInvite_invitedUserId_idx" ON "CollaborationInvite"("invitedUserId");
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");
CREATE INDEX "NotificationDelivery_appRequestId_idx" ON "NotificationDelivery"("appRequestId");
CREATE INDEX "NotificationDelivery_recipientUserId_idx" ON "NotificationDelivery"("recipientUserId");
CREATE INDEX "NotificationDelivery_recipientEmail_idx" ON "NotificationDelivery"("recipientEmail");
CREATE INDEX "NotificationDelivery_eventKey_idx" ON "NotificationDelivery"("eventKey");
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");

ALTER TABLE "CollaborationInvite" ADD CONSTRAINT "CollaborationInvite_appRequestId_fkey" FOREIGN KEY ("appRequestId") REFERENCES "AppRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollaborationInvite" ADD CONSTRAINT "CollaborationInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollaborationInvite" ADD CONSTRAINT "CollaborationInvite_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_appRequestId_fkey" FOREIGN KEY ("appRequestId") REFERENCES "AppRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
