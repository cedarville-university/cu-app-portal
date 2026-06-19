# Collaboration Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immediate SMTP email notifications, user notification preferences, and owner/admin coworker collaboration invites.

**Architecture:** Add focused Prisma models for invites, preferences, and delivery evidence. Build isolated services for SMTP, Entra directory lookup, notification routing, and invite tokens, then wire them into existing server actions and pages. Keep normal app mutations resilient when notification delivery fails, while invite creation keeps a pending invite and exposes resend when SMTP fails.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma 6, PostgreSQL, Vitest, Testing Library, NextAuth v5, Microsoft Graph via `fetch`, Azure Identity, Nodemailer SMTP.

---

## Scope Check

The approved spec is cohesive rather than three independent projects. Collaboration invites need email delivery, invite emails bypass notification preferences, and accepted collaborators become recipients for later app notifications. Implement as one plan with small, independently testable slices.

## File Structure

- Modify `prisma/schema.prisma`: add invite, preference, and delivery models plus enums and relations.
- Create `prisma/migrations/20260619120000_collaboration_notifications/migration.sql`: add database tables and indexes.
- Modify `package.json` and `package-lock.json`: add `nodemailer` and `@types/nodemailer`.
- Create `src/features/notifications/types.ts`: typed event keys, categories, delivery status helpers.
- Create `src/features/notifications/preferences.ts`: default-on preference loading and update input parsing.
- Create `src/features/notifications/config.ts`: SMTP and app URL environment parsing.
- Create `src/features/notifications/mailer.ts`: SMTP provider interface and Nodemailer implementation.
- Create `src/features/notifications/service.ts`: recipient resolution, preference checks, send, delivery logging.
- Create `src/features/directory/config.ts`: Entra directory lookup environment parsing.
- Create `src/features/directory/entra-directory.ts`: Graph lookup client and Cedarville eligibility checks.
- Create `src/features/collaboration-invites/tokens.ts`: token generation and hashing.
- Create `src/features/collaboration-invites/actions.ts`: send, resend, revoke, and accept invite actions.
- Create `src/features/collaboration-invites/invite-panel.tsx`: app details UI for owners/admins.
- Create `src/app/invites/[token]/page.tsx`: signed invite acceptance page.
- Create `src/app/settings/page.tsx`: account/settings page.
- Create `src/features/settings/actions.ts`: notification preference save action.
- Modify `src/app/download/[requestId]/page.tsx`: include pending invites and render invite panel for owners/admins.
- Modify `src/components/site-header.tsx`: add Settings link for signed-in users.
- Modify existing create, repository, publishing, setup repair, deletion, import, and admin actions to emit notification events.
- Modify `src/lib/audit.ts`: add invite, preference, and notification audit events.
- Modify `.env.example`, `README.md`, and `docs/portal/setup.md`: document SMTP, app URL, directory lookup, preferences, and invite behavior.

## Task 1: Add Data Model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260619120000_collaboration_notifications/migration.sql`

- [ ] **Step 1: Update Prisma schema**

Add the new relations to `User`:

```prisma
model User {
  id          String        @id @default(cuid())
  entraOid    String        @unique
  email       String        @unique
  displayName String
  githubUsername String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  appRequests AppRequest[]
  roles       UserRole[]
  appAccess   AppAccess[]
  notificationPreference NotificationPreference?
  collaborationInvitesSent CollaborationInvite[] @relation("CollaborationInviteInviter")
  collaborationInvitesAccepted CollaborationInvite[] @relation("CollaborationInviteAcceptedUser")
  notificationDeliveries NotificationDelivery[]
}
```

Add the new relations to `AppRequest`:

```prisma
model AppRequest {
  id               String             @id @default(cuid())
  userId           String
  templateId       String
  templateVersion  String
  appName          String
  submittedConfig  Json
  generationStatus GenerationStatus
  supportReference String
  visibility       String?
  deploymentTarget String?
  deploymentTriggerMode DeploymentTriggerMode @default(PORTAL_DISPATCH)
  sourceOfTruth    SourceOfTruth      @default(PORTAL_MANAGED_REPO)
  repositoryProvider RepositoryProvider?
  repositoryOwner  String?
  repositoryName   String?
  repositoryUrl    String?
  repositoryDefaultBranch String?
  repositoryVisibility String?
  repositoryStatus RepositoryStatus   @default(PENDING)
  repositoryAccessStatus RepositoryAccessStatus @default(NOT_REQUESTED)
  repositoryAccessNote String?
  publishStatus    PublishStatus      @default(NOT_STARTED)
  publishUrl       String?
  publishErrorSummary String?
  publishingSetupStatus PublishingSetupStatus @default(NOT_CHECKED)
  publishingSetupCheckedAt DateTime?
  publishingSetupRepairedAt DateTime?
  publishingSetupErrorSummary String?
  lastPublishedAt  DateTime?
  azureResourceGroup    String?
  azureAppServicePlan   String?
  azureWebAppName       String?
  azurePostgresServer   String?
  azureDatabaseName     String?
  azureDefaultHostName  String?
  customDomain          String?
  primaryPublishUrl     String?
  publishedAt      DateTime?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  user             User               @relation(fields: [userId], references: [id])
  template         Template           @relation(fields: [templateId], references: [id])
  artifact         GeneratedArtifact?
  publishAttempts  PublishAttempt[]
  repositoryImport RepositoryImport?
  publishSetupChecks PublishSetupCheck[]
  collaborators   AppAccess[]
  collaborationInvites CollaborationInvite[]
  notificationDeliveries NotificationDelivery[]
}
```

Add the new models and enums after `AppAccess`:

```prisma
model CollaborationInvite {
  id                     String                    @id @default(cuid())
  appRequestId           String
  invitedEmail           String
  normalizedInvitedEmail String
  invitedEntraOid        String
  invitedDisplayName     String
  invitedUserId          String?
  inviterUserId          String
  status                 CollaborationInviteStatus @default(PENDING)
  tokenHash              String                    @unique
  expiresAt              DateTime
  acceptedAt             DateTime?
  revokedAt              DateTime?
  lastSentAt             DateTime?
  createdAt              DateTime                  @default(now())
  updatedAt              DateTime                  @updatedAt
  appRequest             AppRequest                @relation(fields: [appRequestId], references: [id], onDelete: Cascade)
  invitedUser            User?                     @relation("CollaborationInviteAcceptedUser", fields: [invitedUserId], references: [id], onDelete: SetNull)
  inviter                User                      @relation("CollaborationInviteInviter", fields: [inviterUserId], references: [id], onDelete: Cascade)

  @@unique([appRequestId, normalizedInvitedEmail])
  @@index([appRequestId])
  @@index([normalizedInvitedEmail])
  @@index([inviterUserId])
  @@index([invitedUserId])
}

model NotificationPreference {
  id                             String   @id @default(cuid())
  userId                         String   @unique
  emailNotificationsEnabled      Boolean  @default(true)
  collaborationEmailsEnabled     Boolean  @default(true)
  appLifecycleEmailsEnabled      Boolean  @default(true)
  publishingEmailsEnabled        Boolean  @default(true)
  createdAt                      DateTime @default(now())
  updatedAt                      DateTime @updatedAt
  user                           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model NotificationDelivery {
  id                String                     @id @default(cuid())
  appRequestId      String?
  recipientUserId   String?
  recipientEmail    String
  eventKey          NotificationEventKey
  category          NotificationCategory
  status            NotificationDeliveryStatus
  provider          String
  providerMessageId String?
  errorSummary      String?
  sentAt            DateTime?
  createdAt         DateTime                   @default(now())
  updatedAt         DateTime                   @updatedAt
  appRequest        AppRequest?                @relation(fields: [appRequestId], references: [id], onDelete: SetNull)
  recipientUser     User?                      @relation(fields: [recipientUserId], references: [id], onDelete: SetNull)

  @@index([appRequestId])
  @@index([recipientUserId])
  @@index([recipientEmail])
  @@index([eventKey])
  @@index([status])
}
```

Add these enums after the existing enums:

```prisma
enum CollaborationInviteStatus {
  PENDING
  ACCEPTED
  REVOKED
  EXPIRED
}

enum NotificationCategory {
  COLLABORATION
  APP_LIFECYCLE
  PUBLISHING
}

enum NotificationEventKey {
  COLLABORATION_INVITE_SENT
  COLLABORATION_INVITE_ACCEPTED
  COLLABORATION_INVITE_REVOKED
  APP_SHARED
  COLLABORATOR_REMOVED
  APP_CREATED
  EXISTING_APP_IMPORTED
  REPOSITORY_READY
  REPOSITORY_FAILED
  APP_DELETED
  PUBLISHING_SETUP_NEEDS_REPAIR
  PUBLISHING_SETUP_BLOCKED
  PUBLISH_SUCCEEDED
  PUBLISH_FAILED
  OWNER_REASSIGNED
}

enum NotificationDeliveryStatus {
  PENDING
  SENT
  FAILED
  SKIPPED
}
```

- [ ] **Step 2: Add SQL migration**

Create `prisma/migrations/20260619120000_collaboration_notifications/migration.sql` with:

```sql
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
CREATE UNIQUE INDEX "CollaborationInvite_appRequestId_normalizedInvitedEmail_key" ON "CollaborationInvite"("appRequestId", "normalizedInvitedEmail");
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
```

- [ ] **Step 3: Run Prisma validation**

Run: `npm run prisma:generate`

Expected: command succeeds and Prisma Client includes the new models and enums.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260619120000_collaboration_notifications/migration.sql
git commit -m "feat: add collaboration notification data model"
```

## Task 2: Add Notification Types And Preference Helpers

**Files:**
- Create: `src/features/notifications/types.ts`
- Create: `src/features/notifications/preferences.ts`
- Test: `src/features/notifications/preferences.test.ts`

- [ ] **Step 1: Write failing preference tests**

Create `src/features/notifications/preferences.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  canReceiveNotificationCategory,
  parseNotificationPreferenceForm,
} from "./preferences";

describe("notification preferences", () => {
  it("defaults every email category to on", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      emailNotificationsEnabled: true,
      collaborationEmailsEnabled: true,
      appLifecycleEmailsEnabled: true,
      publishingEmailsEnabled: true,
    });
  });

  it("allows category mail when no row exists", () => {
    expect(canReceiveNotificationCategory(null, "COLLABORATION")).toBe(true);
    expect(canReceiveNotificationCategory(null, "APP_LIFECYCLE")).toBe(true);
    expect(canReceiveNotificationCategory(null, "PUBLISHING")).toBe(true);
  });

  it("global opt-out blocks every normal category", () => {
    const preference = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      emailNotificationsEnabled: false,
    };

    expect(canReceiveNotificationCategory(preference, "COLLABORATION")).toBe(false);
    expect(canReceiveNotificationCategory(preference, "APP_LIFECYCLE")).toBe(false);
    expect(canReceiveNotificationCategory(preference, "PUBLISHING")).toBe(false);
  });

  it("category opt-out blocks only that category", () => {
    const preference = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      publishingEmailsEnabled: false,
    };

    expect(canReceiveNotificationCategory(preference, "COLLABORATION")).toBe(true);
    expect(canReceiveNotificationCategory(preference, "APP_LIFECYCLE")).toBe(true);
    expect(canReceiveNotificationCategory(preference, "PUBLISHING")).toBe(false);
  });

  it("parses checkbox form values into booleans", () => {
    const formData = new FormData();
    formData.set("emailNotificationsEnabled", "on");
    formData.set("collaborationEmailsEnabled", "on");
    formData.set("publishingEmailsEnabled", "on");

    expect(parseNotificationPreferenceForm(formData)).toEqual({
      emailNotificationsEnabled: true,
      collaborationEmailsEnabled: true,
      appLifecycleEmailsEnabled: false,
      publishingEmailsEnabled: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/notifications/preferences.test.ts`

Expected: FAIL because `src/features/notifications/preferences.ts` does not exist.

- [ ] **Step 3: Add notification types**

Create `src/features/notifications/types.ts`:

```ts
import type {
  NotificationCategory,
  NotificationDeliveryStatus,
  NotificationEventKey,
} from "@prisma/client";

export type AppNotificationCategory = NotificationCategory;
export type AppNotificationEventKey = NotificationEventKey;
export type AppNotificationDeliveryStatus = NotificationDeliveryStatus;

export const NOTIFICATION_EVENT_CATEGORY: Record<
  AppNotificationEventKey,
  AppNotificationCategory
> = {
  COLLABORATION_INVITE_SENT: "COLLABORATION",
  COLLABORATION_INVITE_ACCEPTED: "COLLABORATION",
  COLLABORATION_INVITE_REVOKED: "COLLABORATION",
  APP_SHARED: "COLLABORATION",
  COLLABORATOR_REMOVED: "COLLABORATION",
  APP_CREATED: "APP_LIFECYCLE",
  EXISTING_APP_IMPORTED: "APP_LIFECYCLE",
  REPOSITORY_READY: "APP_LIFECYCLE",
  REPOSITORY_FAILED: "APP_LIFECYCLE",
  APP_DELETED: "APP_LIFECYCLE",
  PUBLISHING_SETUP_NEEDS_REPAIR: "PUBLISHING",
  PUBLISHING_SETUP_BLOCKED: "PUBLISHING",
  PUBLISH_SUCCEEDED: "PUBLISHING",
  PUBLISH_FAILED: "PUBLISHING",
  OWNER_REASSIGNED: "PUBLISHING",
};
```

- [ ] **Step 4: Add preference helper implementation**

Create `src/features/notifications/preferences.ts`:

```ts
import type { NotificationCategory } from "@prisma/client";

export type NotificationPreferenceSnapshot = {
  emailNotificationsEnabled: boolean;
  collaborationEmailsEnabled: boolean;
  appLifecycleEmailsEnabled: boolean;
  publishingEmailsEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceSnapshot = {
  emailNotificationsEnabled: true,
  collaborationEmailsEnabled: true,
  appLifecycleEmailsEnabled: true,
  publishingEmailsEnabled: true,
};

export function canReceiveNotificationCategory(
  preference: NotificationPreferenceSnapshot | null | undefined,
  category: NotificationCategory,
) {
  const effective = preference ?? DEFAULT_NOTIFICATION_PREFERENCES;

  if (!effective.emailNotificationsEnabled) {
    return false;
  }

  if (category === "COLLABORATION") {
    return effective.collaborationEmailsEnabled;
  }

  if (category === "APP_LIFECYCLE") {
    return effective.appLifecycleEmailsEnabled;
  }

  return effective.publishingEmailsEnabled;
}

export function parseNotificationPreferenceForm(
  formData: FormData,
): NotificationPreferenceSnapshot {
  return {
    emailNotificationsEnabled: formData.get("emailNotificationsEnabled") === "on",
    collaborationEmailsEnabled:
      formData.get("collaborationEmailsEnabled") === "on",
    appLifecycleEmailsEnabled:
      formData.get("appLifecycleEmailsEnabled") === "on",
    publishingEmailsEnabled: formData.get("publishingEmailsEnabled") === "on",
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/notifications/preferences.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/notifications/types.ts src/features/notifications/preferences.ts src/features/notifications/preferences.test.ts
git commit -m "feat: add notification preference helpers"
```

## Task 3: Add SMTP Provider And Delivery Logging

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/notifications/config.ts`
- Create: `src/features/notifications/mailer.ts`
- Create: `src/features/notifications/mailer.test.ts`
- Create: `src/features/notifications/service.ts`
- Create: `src/features/notifications/service.test.ts`

- [ ] **Step 1: Install mail dependency**

Run: `npm install nodemailer && npm install -D @types/nodemailer`

Expected: `package.json` and `package-lock.json` include the new packages.

- [ ] **Step 2: Write failing mailer tests**

Create `src/features/notifications/mailer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadSmtpConfig } from "./config";
import { createSmtpMailer } from "./mailer";

describe("SMTP notification mailer", () => {
  it("loads SMTP config from environment values", () => {
    expect(
      loadSmtpConfig({
        PORTAL_APP_URL: "https://portal.example.edu",
        SMTP_HOST: "smtp.example.edu",
        SMTP_PORT: "587",
        SMTP_USERNAME: "portal",
        SMTP_PASSWORD: "secret",
        SMTP_TLS_MODE: "starttls",
        SMTP_FROM: "App Portal <portal@example.edu>",
        SMTP_REPLY_TO: "support@example.edu",
      }),
    ).toEqual({
      appUrl: "https://portal.example.edu",
      host: "smtp.example.edu",
      port: 587,
      username: "portal",
      password: "secret",
      tlsMode: "starttls",
      from: "App Portal <portal@example.edu>",
      replyTo: "support@example.edu",
    });
  });

  it("rejects invalid TLS mode", () => {
    expect(() =>
      loadSmtpConfig({
        PORTAL_APP_URL: "https://portal.example.edu",
        SMTP_HOST: "smtp.example.edu",
        SMTP_PORT: "587",
        SMTP_TLS_MODE: "sometimes",
        SMTP_FROM: "portal@example.edu",
      }),
    ).toThrow();
  });

  it("wraps a transport and returns provider message id", async () => {
    const messages: unknown[] = [];
    const mailer = createSmtpMailer({
      config: {
        appUrl: "https://portal.example.edu",
        host: "smtp.example.edu",
        port: 587,
        tlsMode: "starttls",
        from: "portal@example.edu",
      },
      transport: {
        async sendMail(message) {
          messages.push(message);
          return { messageId: "smtp-123" };
        },
      },
    });

    await expect(
      mailer.send({
        to: "staff@cedarville.edu",
        subject: "Portal update",
        text: "Text body",
        html: "<p>Text body</p>",
      }),
    ).resolves.toEqual({ provider: "smtp", providerMessageId: "smtp-123" });
    expect(messages).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run mailer test to verify it fails**

Run: `npm test -- src/features/notifications/mailer.test.ts`

Expected: FAIL because config and mailer files do not exist.

- [ ] **Step 4: Add SMTP config**

Create `src/features/notifications/config.ts`:

```ts
import { z } from "zod";

const smtpConfigSchema = z.object({
  PORTAL_APP_URL: z.string().url(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USERNAME: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_TLS_MODE: z.enum(["none", "starttls", "ssl"]).default("starttls"),
  SMTP_FROM: z.string().min(1),
  SMTP_REPLY_TO: z.string().min(1).optional(),
});

export type SmtpConfig = {
  appUrl: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  tlsMode: "none" | "starttls" | "ssl";
  from: string;
  replyTo?: string;
};

export function loadSmtpConfig(
  source: Record<string, string | undefined> = process.env,
): SmtpConfig {
  const parsed = smtpConfigSchema.parse(source);

  return {
    appUrl: parsed.PORTAL_APP_URL,
    host: parsed.SMTP_HOST,
    port: parsed.SMTP_PORT,
    username: parsed.SMTP_USERNAME,
    password: parsed.SMTP_PASSWORD,
    tlsMode: parsed.SMTP_TLS_MODE,
    from: parsed.SMTP_FROM,
    replyTo: parsed.SMTP_REPLY_TO,
  };
}
```

- [ ] **Step 5: Add mailer provider**

Create `src/features/notifications/mailer.ts`:

```ts
import nodemailer, { type Transporter } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type { SmtpConfig } from "./config";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailSendResult = {
  provider: "smtp";
  providerMessageId?: string;
};

export type Mailer = {
  send(message: MailMessage): Promise<MailSendResult>;
};

type SendMailTransport = Pick<Transporter, "sendMail">;

function createTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.tlsMode === "ssl",
    requireTLS: config.tlsMode === "starttls",
    auth:
      config.username && config.password
        ? { user: config.username, pass: config.password }
        : undefined,
  });
}

export function createSmtpMailer({
  config,
  transport = createTransport(config),
}: {
  config: SmtpConfig;
  transport?: SendMailTransport;
}): Mailer {
  return {
    async send(message) {
      const result = await transport.sendMail({
        from: config.from,
        replyTo: config.replyTo,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      } satisfies Mail.Options);

      return {
        provider: "smtp",
        providerMessageId:
          typeof result.messageId === "string" ? result.messageId : undefined,
      };
    },
  };
}
```

- [ ] **Step 6: Run mailer test to verify it passes**

Run: `npm test -- src/features/notifications/mailer.test.ts`

Expected: PASS.

- [ ] **Step 7: Write failing notification service tests**

Create `src/features/notifications/service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendAppNotification } from "./service";

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findUnique: vi.fn() },
    notificationDelivery: { create: vi.fn() },
  },
}));

const { prisma } = await import("@/lib/db");

describe("sendAppNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends to owner and collaborators except the actor", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      appName: "Campus Forms",
      supportReference: "CU-123",
      userId: "owner-123",
      user: {
        id: "owner-123",
        email: "owner@cedarville.edu",
        displayName: "Owner User",
        notificationPreference: null,
      },
      collaborators: [
        {
          user: {
            id: "collab-123",
            email: "collab@cedarville.edu",
            displayName: "Collaborator User",
            notificationPreference: null,
          },
        },
      ],
    } as never);
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await sendAppNotification({
      appRequestId: "request-123",
      eventKey: "REPOSITORY_READY",
      actorUserId: "owner-123",
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "collab@cedarville.edu" }),
    );
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: "collab@cedarville.edu",
          eventKey: "REPOSITORY_READY",
          category: "APP_LIFECYCLE",
          status: "SENT",
        }),
      }),
    );
  });

  it("records skipped delivery when preferences opt out", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      appName: "Campus Forms",
      supportReference: "CU-123",
      userId: "owner-123",
      user: {
        id: "owner-123",
        email: "owner@cedarville.edu",
        displayName: "Owner User",
        notificationPreference: {
          emailNotificationsEnabled: false,
          collaborationEmailsEnabled: true,
          appLifecycleEmailsEnabled: true,
          publishingEmailsEnabled: true,
        },
      },
      collaborators: [],
    } as never);
    const mailer = { send: vi.fn() };

    await sendAppNotification({
      appRequestId: "request-123",
      eventKey: "REPOSITORY_READY",
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(mailer.send).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: "owner@cedarville.edu",
          status: "SKIPPED",
        }),
      }),
    );
  });
});
```

- [ ] **Step 8: Run service test to verify it fails**

Run: `npm test -- src/features/notifications/service.test.ts`

Expected: FAIL because `sendAppNotification` does not exist.

- [ ] **Step 9: Add notification service**

Create `src/features/notifications/service.ts`:

```ts
import type { NotificationEventKey } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Mailer } from "./mailer";
import { canReceiveNotificationCategory } from "./preferences";
import { NOTIFICATION_EVENT_CATEGORY } from "./types";

type Recipient = {
  id: string;
  email: string;
  displayName: string;
  notificationPreference: {
    emailNotificationsEnabled: boolean;
    collaborationEmailsEnabled: boolean;
    appLifecycleEmailsEnabled: boolean;
    publishingEmailsEnabled: boolean;
  } | null;
};

type SendAppNotificationInput = {
  appRequestId: string;
  eventKey: NotificationEventKey;
  actorUserId?: string;
  directRecipientUserIds?: string[];
  mailer: Mailer;
  appUrl: string;
};

function uniqueRecipients(recipients: Recipient[]) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    if (seen.has(recipient.id)) {
      return false;
    }
    seen.add(recipient.id);
    return true;
  });
}

function subjectFor(eventKey: NotificationEventKey, appName: string) {
  const labels: Record<NotificationEventKey, string> = {
    COLLABORATION_INVITE_SENT: "Collaboration invite sent",
    COLLABORATION_INVITE_ACCEPTED: "Collaboration invite accepted",
    COLLABORATION_INVITE_REVOKED: "Collaboration invite revoked",
    APP_SHARED: "App shared",
    COLLABORATOR_REMOVED: "Collaborator removed",
    APP_CREATED: "App created",
    EXISTING_APP_IMPORTED: "Existing app imported",
    REPOSITORY_READY: "Repository ready",
    REPOSITORY_FAILED: "Repository setup failed",
    APP_DELETED: "App deleted",
    PUBLISHING_SETUP_NEEDS_REPAIR: "Publishing setup needs repair",
    PUBLISHING_SETUP_BLOCKED: "Publishing setup blocked",
    PUBLISH_SUCCEEDED: "Publish succeeded",
    PUBLISH_FAILED: "Publish failed",
    OWNER_REASSIGNED: "Owner reassigned",
  };

  return `${labels[eventKey]}: ${appName}`;
}

function bodyFor({
  eventKey,
  appName,
  supportReference,
  appUrl,
  appRequestId,
}: {
  eventKey: NotificationEventKey;
  appName: string;
  supportReference: string;
  appUrl: string;
  appRequestId: string;
}) {
  const detailsUrl = `${appUrl}/download/${appRequestId}`;
  const settingsUrl = `${appUrl}/settings`;

  return [
    `Cedarville App Portal update for ${appName}.`,
    `Event: ${eventKey.toLowerCase().replaceAll("_", " ")}.`,
    `Support reference: ${supportReference}.`,
    `App details: ${detailsUrl}`,
    `Notification settings: ${settingsUrl}`,
  ].join("\n\n");
}

export async function sendAppNotification({
  appRequestId,
  eventKey,
  actorUserId,
  directRecipientUserIds = [],
  mailer,
  appUrl,
}: SendAppNotificationInput) {
  const appRequest = await prisma.appRequest.findUnique({
    where: { id: appRequestId },
    include: {
      user: { include: { notificationPreference: true } },
      collaborators: {
        include: { user: { include: { notificationPreference: true } } },
      },
    },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  const category = NOTIFICATION_EVENT_CATEGORY[eventKey];
  const recipients = uniqueRecipients([
    appRequest.user,
    ...appRequest.collaborators.map((access) => access.user),
  ]).filter((recipient) => {
    if (recipient.id === actorUserId && !directRecipientUserIds.includes(recipient.id)) {
      return false;
    }
    return true;
  });

  for (const recipient of recipients) {
    if (!canReceiveNotificationCategory(recipient.notificationPreference, category)) {
      await prisma.notificationDelivery.create({
        data: {
          appRequestId,
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

    const text = bodyFor({
      eventKey,
      appName: appRequest.appName,
      supportReference: appRequest.supportReference,
      appUrl,
      appRequestId,
    });

    try {
      const result = await mailer.send({
        to: recipient.email,
        subject: subjectFor(eventKey, appRequest.appName),
        text,
        html: text
          .split("\n\n")
          .map((paragraph) => `<p>${paragraph}</p>`)
          .join(""),
      });

      await prisma.notificationDelivery.create({
        data: {
          appRequestId,
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
          appRequestId,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          eventKey,
          category,
          status: "FAILED",
          provider: "smtp",
          errorSummary: error instanceof Error ? error.message : "unknown",
        },
      });
    }
  }
}
```

- [ ] **Step 10: Run notification tests**

Run: `npm test -- src/features/notifications/mailer.test.ts src/features/notifications/service.test.ts`

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json src/features/notifications
git commit -m "feat: add smtp notification service"
```

## Task 4: Add Entra Directory Lookup

**Files:**
- Create: `src/features/directory/config.ts`
- Create: `src/features/directory/entra-directory.ts`
- Test: `src/features/directory/entra-directory.test.ts`

- [ ] **Step 1: Write failing directory tests**

Create `src/features/directory/entra-directory.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createEntraDirectoryClient, isCedarvilleMemberUser } from "./entra-directory";
import { loadDirectoryConfig } from "./config";

describe("directory config", () => {
  it("loads directory lookup configuration", () => {
    expect(
      loadDirectoryConfig({
        ENTRA_DIRECTORY_TENANT_ID: "tenant-123",
        ENTRA_DIRECTORY_CLIENT_ID: "client-123",
        ENTRA_DIRECTORY_CLIENT_SECRET: "secret-123",
        ENTRA_ALLOWED_EMAIL_DOMAIN: "cedarville.edu",
      }),
    ).toEqual({
      tenantId: "tenant-123",
      clientId: "client-123",
      clientSecret: "secret-123",
      allowedEmailDomain: "cedarville.edu",
    });
  });
});

describe("isCedarvilleMemberUser", () => {
  it("accepts a member user with a Cedarville primary email", () => {
    expect(
      isCedarvilleMemberUser(
        {
          id: "entra-123",
          displayName: "Portal Staff",
          mail: "staff@cedarville.edu",
          userPrincipalName: "staff@cedarville.edu",
          userType: "Member",
          proxyAddresses: [],
          otherMails: [],
        },
        "staff@cedarville.edu",
        "cedarville.edu",
      ),
    ).toBe(true);
  });

  it("accepts a Cedarville alias returned by Entra", () => {
    expect(
      isCedarvilleMemberUser(
        {
          id: "entra-123",
          displayName: "Portal Staff",
          mail: "primary@cedarville.edu",
          userPrincipalName: "primary@cedarville.edu",
          userType: "Member",
          proxyAddresses: ["SMTP:primary@cedarville.edu", "smtp:alias@cedarville.edu"],
          otherMails: [],
        },
        "alias@cedarville.edu",
        "cedarville.edu",
      ),
    ).toBe(true);
  });

  it("rejects guest users and non-Cedarville addresses", () => {
    expect(
      isCedarvilleMemberUser(
        {
          id: "entra-123",
          displayName: "External Guest",
          mail: "guest@example.com",
          userPrincipalName: "guest_example.com#EXT#@cedarville.edu",
          userType: "Guest",
          proxyAddresses: [],
          otherMails: [],
        },
        "guest@example.com",
        "cedarville.edu",
      ),
    ).toBe(false);
  });
});

describe("createEntraDirectoryClient", () => {
  it("fetches and normalizes a matching user by email", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            {
              id: "entra-123",
              displayName: "Portal Staff",
              mail: "staff@cedarville.edu",
              userPrincipalName: "staff@cedarville.edu",
              userType: "Member",
              proxyAddresses: ["SMTP:staff@cedarville.edu"],
              otherMails: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const client = createEntraDirectoryClient({
      tokenProvider: async () => "token-123",
      allowedEmailDomain: "cedarville.edu",
      fetchImpl,
    });

    await expect(client.findEligibleUserByEmail("Staff@Cedarville.edu")).resolves.toEqual({
      entraOid: "entra-123",
      displayName: "Portal Staff",
      email: "staff@cedarville.edu",
      aliases: ["staff@cedarville.edu"],
    });
  });
});
```

- [ ] **Step 2: Run directory test to verify it fails**

Run: `npm test -- src/features/directory/entra-directory.test.ts`

Expected: FAIL because directory files do not exist.

- [ ] **Step 3: Add directory config**

Create `src/features/directory/config.ts`:

```ts
import { z } from "zod";

const directoryConfigSchema = z.object({
  ENTRA_DIRECTORY_TENANT_ID: z.string().min(1),
  ENTRA_DIRECTORY_CLIENT_ID: z.string().min(1),
  ENTRA_DIRECTORY_CLIENT_SECRET: z.string().min(1),
  ENTRA_ALLOWED_EMAIL_DOMAIN: z.string().min(1).default("cedarville.edu"),
});

export type DirectoryConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  allowedEmailDomain: string;
};

export function loadDirectoryConfig(
  source: Record<string, string | undefined> = process.env,
): DirectoryConfig {
  const parsed = directoryConfigSchema.parse(source);

  return {
    tenantId: parsed.ENTRA_DIRECTORY_TENANT_ID,
    clientId: parsed.ENTRA_DIRECTORY_CLIENT_ID,
    clientSecret: parsed.ENTRA_DIRECTORY_CLIENT_SECRET,
    allowedEmailDomain: parsed.ENTRA_ALLOWED_EMAIL_DOMAIN,
  };
}
```

- [ ] **Step 4: Add Entra directory client**

Create `src/features/directory/entra-directory.ts`:

```ts
type FetchLike = typeof fetch;

export type EntraUserRecord = {
  id: string;
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string | null;
  userType: string | null;
  proxyAddresses?: string[] | null;
  otherMails?: string[] | null;
};

export type EligibleDirectoryUser = {
  entraOid: string;
  displayName: string;
  email: string;
  aliases: string[];
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function stripProxyPrefix(address: string) {
  return address.replace(/^smtp:/i, "");
}

function allEmails(user: EntraUserRecord) {
  return [
    user.mail,
    user.userPrincipalName,
    ...(user.proxyAddresses ?? []).map(stripProxyPrefix),
    ...(user.otherMails ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeEmail);
}

function hasAllowedDomain(email: string, allowedEmailDomain: string) {
  return normalizeEmail(email).endsWith(`@${allowedEmailDomain.toLowerCase()}`);
}

export function isCedarvilleMemberUser(
  user: EntraUserRecord,
  submittedEmail: string,
  allowedEmailDomain: string,
) {
  if (user.userType !== "Member") {
    return false;
  }

  const normalizedSubmittedEmail = normalizeEmail(submittedEmail);
  const emails = allEmails(user);

  return (
    emails.includes(normalizedSubmittedEmail) &&
    emails.some((email) => hasAllowedDomain(email, allowedEmailDomain))
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Microsoft Graph request failed: ${response.status} ${text}`);
  }

  return JSON.parse(text) as T;
}

export function createEntraDirectoryClient({
  tokenProvider,
  allowedEmailDomain,
  fetchImpl = fetch,
}: {
  tokenProvider: () => Promise<string>;
  allowedEmailDomain: string;
  fetchImpl?: FetchLike;
}) {
  async function headers() {
    return {
      Authorization: `Bearer ${await tokenProvider()}`,
      "Content-Type": "application/json",
    };
  }

  return {
    async findEligibleUserByEmail(email: string): Promise<EligibleDirectoryUser | null> {
      const normalizedEmail = normalizeEmail(email);
      const filter = encodeURIComponent(
        `mail eq '${normalizedEmail}' or userPrincipalName eq '${normalizedEmail}' or proxyAddresses/any(p:p eq 'smtp:${normalizedEmail}') or proxyAddresses/any(p:p eq 'SMTP:${normalizedEmail}') or otherMails/any(m:m eq '${normalizedEmail}')`,
      );
      const select = [
        "id",
        "displayName",
        "mail",
        "userPrincipalName",
        "userType",
        "proxyAddresses",
        "otherMails",
      ].join(",");
      const data = await readJson<{ value?: EntraUserRecord[] }>(
        await fetchImpl(
          `https://graph.microsoft.com/v1.0/users?$select=${select}&$filter=${filter}`,
          { method: "GET", headers: await headers() },
        ),
      );
      const user = (data.value ?? []).find((candidate) =>
        isCedarvilleMemberUser(candidate, normalizedEmail, allowedEmailDomain),
      );

      if (!user) {
        return null;
      }

      const aliases = Array.from(new Set(allEmails(user))).filter((alias) =>
        hasAllowedDomain(alias, allowedEmailDomain),
      );

      return {
        entraOid: user.id,
        displayName: user.displayName ?? aliases[0] ?? normalizedEmail,
        email: normalizeEmail(user.mail ?? user.userPrincipalName ?? normalizedEmail),
        aliases,
      };
    },
  };
}
```

- [ ] **Step 5: Run directory tests**

Run: `npm test -- src/features/directory/entra-directory.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/directory
git commit -m "feat: add entra directory lookup"
```

## Task 5: Add Settings Page And Preference Action

**Files:**
- Create: `src/features/settings/actions.ts`
- Create: `src/features/settings/actions.test.ts`
- Create: `src/app/settings/page.tsx`
- Create: `src/app/settings/page.test.tsx`
- Modify: `src/components/site-header.tsx`
- Modify: `src/components/site-header.test.tsx`
- Modify: `src/lib/audit.ts`

- [ ] **Step 1: Add audit event type**

Modify `src/lib/audit.ts` to include:

```ts
  | "NOTIFICATION_PREFERENCES_UPDATED"
```

- [ ] **Step 2: Write failing settings action test**

Create `src/features/settings/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateNotificationPreferencesAction } from "./actions";

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    notificationPreference: { upsert: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { resolveCurrentUserId } = await import("@/features/app-requests/current-user");
const { recordAuditEvent } = await import("@/lib/audit");
const { prisma } = await import("@/lib/db");

describe("updateNotificationPreferencesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
  });

  it("upserts notification preferences for the current user", async () => {
    const formData = new FormData();
    formData.set("emailNotificationsEnabled", "on");
    formData.set("collaborationEmailsEnabled", "on");
    formData.set("appLifecycleEmailsEnabled", "on");

    await updateNotificationPreferencesAction(formData);

    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: "user-123" },
      update: {
        emailNotificationsEnabled: true,
        collaborationEmailsEnabled: true,
        appLifecycleEmailsEnabled: true,
        publishingEmailsEnabled: false,
      },
      create: {
        userId: "user-123",
        emailNotificationsEnabled: true,
        collaborationEmailsEnabled: true,
        appLifecycleEmailsEnabled: true,
        publishingEmailsEnabled: false,
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "NOTIFICATION_PREFERENCES_UPDATED",
      { actorUserId: "user-123" },
    );
  });
});
```

- [ ] **Step 3: Run settings action test to verify it fails**

Run: `npm test -- src/features/settings/actions.test.ts`

Expected: FAIL because the action does not exist.

- [ ] **Step 4: Add settings action**

Create `src/features/settings/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { parseNotificationPreferenceForm } from "@/features/notifications/preferences";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

export async function updateNotificationPreferencesAction(formData: FormData) {
  const userId = await resolveCurrentUserId();
  const preferences = parseNotificationPreferenceForm(formData);

  await prisma.notificationPreference.upsert({
    where: { userId },
    update: preferences,
    create: {
      userId,
      ...preferences,
    },
  });

  await recordAuditEvent("NOTIFICATION_PREFERENCES_UPDATED", {
    actorUserId: userId,
  });

  revalidatePath("/settings");
}
```

- [ ] **Step 5: Run settings action test**

Run: `npm test -- src/features/settings/actions.test.ts`

Expected: PASS.

- [ ] **Step 6: Write failing settings page test**

Create `src/app/settings/page.test.tsx`:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    notificationPreference: { findUnique: vi.fn() },
  },
}));

const { getCurrentUserIdOrNull } = await import("@/features/app-requests/current-user");
const { prisma } = await import("@/lib/db");

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);
  });

  it("renders notification preferences with default-on values", async () => {
    render(await SettingsPage());

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email notifications")).toBeChecked();
    expect(screen.getByLabelText("Collaboration emails")).toBeChecked();
    expect(screen.getByLabelText("App lifecycle emails")).toBeChecked();
    expect(screen.getByLabelText("Publishing emails")).toBeChecked();
  });
});
```

- [ ] **Step 7: Add settings page**

Create `src/app/settings/page.tsx`:

```tsx
import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/features/notifications/preferences";
import { updateNotificationPreferencesAction } from "@/features/settings/actions";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { prisma } from "@/lib/db";

function checked(value: boolean) {
  return value ? { defaultChecked: true } : {};
}

export default async function SettingsPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  const stored = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  const preferences = stored ?? DEFAULT_NOTIFICATION_PREFERENCES;

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">/</span>
        <span aria-current="page">Settings</span>
      </nav>

      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage your account preferences for the App Portal.</p>
      </div>

      <section className="card">
        <h2>Notification Preferences</h2>
        <form action={updateNotificationPreferencesAction} className="form-stack">
          <label className="checkbox-row">
            <input
              name="emailNotificationsEnabled"
              type="checkbox"
              {...checked(preferences.emailNotificationsEnabled)}
            />
            Email notifications
          </label>
          <label className="checkbox-row">
            <input
              name="collaborationEmailsEnabled"
              type="checkbox"
              {...checked(preferences.collaborationEmailsEnabled)}
            />
            Collaboration emails
          </label>
          <label className="checkbox-row">
            <input
              name="appLifecycleEmailsEnabled"
              type="checkbox"
              {...checked(preferences.appLifecycleEmailsEnabled)}
            />
            App lifecycle emails
          </label>
          <label className="checkbox-row">
            <input
              name="publishingEmailsEnabled"
              type="checkbox"
              {...checked(preferences.publishingEmailsEnabled)}
            />
            Publishing emails
          </label>
          <PendingSubmitButton
            idleLabel="Save Preferences"
            pendingLabel="Saving..."
            statusText="Saving notification preferences."
            size="sm"
          />
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 8: Add Settings link to header**

Modify `src/components/site-header.tsx` inside the authenticated nav block:

```tsx
          {session?.user ? <Link href="/settings">Settings</Link> : null}
```

- [ ] **Step 9: Run settings tests**

Run: `npm test -- src/features/settings/actions.test.ts src/app/settings/page.test.tsx src/components/site-header.test.tsx`

Expected: PASS. If `site-header.test.tsx` expects the old link set, update the assertion to include Settings only for signed-in users.

- [ ] **Step 10: Commit**

```bash
git add src/lib/audit.ts src/features/settings src/app/settings src/components/site-header.tsx src/components/site-header.test.tsx
git commit -m "feat: add notification settings page"
```

## Task 6: Add Collaboration Invite Tokens And Actions

**Files:**
- Create: `src/features/collaboration-invites/tokens.ts`
- Create: `src/features/collaboration-invites/tokens.test.ts`
- Create: `src/features/collaboration-invites/actions.ts`
- Create: `src/features/collaboration-invites/actions.test.ts`
- Modify: `src/lib/audit.ts`

- [ ] **Step 1: Add audit event types**

Modify `src/lib/audit.ts` to include:

```ts
  | "COLLABORATION_INVITE_SENT"
  | "COLLABORATION_INVITE_RESENT"
  | "COLLABORATION_INVITE_REVOKED"
  | "COLLABORATION_INVITE_ACCEPTED"
  | "COLLABORATION_INVITE_EXPIRED"
  | "NOTIFICATION_DELIVERY_FAILED"
```

- [ ] **Step 2: Write failing token tests**

Create `src/features/collaboration-invites/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createInviteToken, hashInviteToken } from "./tokens";

describe("invite tokens", () => {
  it("creates URL-safe tokens and stable hashes", () => {
    const token = createInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(30);
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
    expect(hashInviteToken(token)).not.toBe(token);
  });
});
```

- [ ] **Step 3: Add token helpers**

Create `src/features/collaboration-invites/tokens.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

export function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
```

- [ ] **Step 4: Run token tests**

Run: `npm test -- src/features/collaboration-invites/tokens.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing invite action tests**

Create `src/features/collaboration-invites/actions.test.ts` with tests for owner/admin send, collaborator denial, revoke, and accept:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptCollaborationInviteAction,
  revokeCollaborationInviteAction,
  sendCollaborationInviteAction,
} from "./actions";

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));
vi.mock("@/features/app-requests/access", () => ({
  userHasAdminRole: vi.fn(),
}));
vi.mock("@/features/directory/config", () => ({
  loadDirectoryConfig: vi.fn(),
}));
vi.mock("@/features/directory/entra-directory", () => ({
  createEntraDirectoryClient: vi.fn(),
}));
vi.mock("@/features/notifications/config", () => ({
  loadSmtpConfig: vi.fn(),
}));
vi.mock("@/features/notifications/mailer", () => ({
  createSmtpMailer: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findFirst: vi.fn(), findUnique: vi.fn() },
    collaborationInvite: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    appAccess: { upsert: vi.fn() },
    user: { upsert: vi.fn() },
    $transaction: vi.fn(async (callback) => callback(prisma)),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { resolveCurrentUserId } = await import("@/features/app-requests/current-user");
const { userHasAdminRole } = await import("@/features/app-requests/access");
const { createEntraDirectoryClient } = await import("@/features/directory/entra-directory");
const { createSmtpMailer } = await import("@/features/notifications/mailer");
const { prisma } = await import("@/lib/db");

describe("collaboration invite actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveCurrentUserId).mockResolvedValue("owner-123");
    vi.mocked(userHasAdminRole).mockResolvedValue(false);
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "owner-123",
      appName: "Campus Forms",
      supportReference: "CU-123",
    } as never);
    vi.mocked(createEntraDirectoryClient).mockReturnValue({
      findEligibleUserByEmail: vi.fn().mockResolvedValue({
        entraOid: "entra-456",
        displayName: "Invited User",
        email: "invited@cedarville.edu",
        aliases: ["invited@cedarville.edu"],
      }),
    } as never);
    vi.mocked(createSmtpMailer).mockReturnValue({
      send: vi.fn().mockResolvedValue({ provider: "smtp", providerMessageId: "mail-123" }),
    } as never);
    vi.mocked(prisma.collaborationInvite.upsert).mockResolvedValue({
      id: "invite-123",
      appRequestId: "request-123",
      normalizedInvitedEmail: "invited@cedarville.edu",
    } as never);
  });

  it("lets an owner send an invite after directory validation", async () => {
    const formData = new FormData();
    formData.set("email", "Invited@Cedarville.edu");

    await sendCollaborationInviteAction("request-123", formData);

    expect(prisma.collaborationInvite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          appRequestId_normalizedInvitedEmail: {
            appRequestId: "request-123",
            normalizedInvitedEmail: "invited@cedarville.edu",
          },
        },
      }),
    );
  });

  it("rejects collaborators who are not owners or admins", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("collab-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);
    const formData = new FormData();
    formData.set("email", "invited@cedarville.edu");

    await expect(sendCollaborationInviteAction("request-123", formData)).rejects.toThrow(
      "Only owners and admins can manage collaboration invites.",
    );
  });

  it("revokes a pending invite", async () => {
    vi.mocked(prisma.collaborationInvite.update).mockResolvedValue({
      id: "invite-123",
      appRequestId: "request-123",
      status: "REVOKED",
    } as never);

    await revokeCollaborationInviteAction("request-123", "invite-123");

    expect(prisma.collaborationInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "invite-123" },
        data: expect.objectContaining({ status: "REVOKED" }),
      }),
    );
  });

  it("accepts a pending invite for the matching signed-in user", async () => {
    vi.mocked(resolveCurrentUserId).mockResolvedValue("invited-user-123");
    vi.mocked(prisma.collaborationInvite.findFirst).mockResolvedValue({
      id: "invite-123",
      appRequestId: "request-123",
      invitedEntraOid: "entra-456",
      normalizedInvitedEmail: "invited@cedarville.edu",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1000 * 60),
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: "invited-user-123",
      entraOid: "entra-456",
      email: "invited@cedarville.edu",
      displayName: "Invited User",
    } as never);

    await acceptCollaborationInviteAction("token-123", {
      entraOid: "entra-456",
      email: "invited@cedarville.edu",
      name: "Invited User",
    });

    expect(prisma.appAccess.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { appRequestId: "request-123", userId: "invited-user-123" },
      }),
    );
  });
});
```

- [ ] **Step 6: Run invite action tests to verify they fail**

Run: `npm test -- src/features/collaboration-invites/actions.test.ts`

Expected: FAIL because invite actions do not exist.

- [ ] **Step 7: Add invite actions**

Create `src/features/collaboration-invites/actions.ts` with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { loadDirectoryConfig } from "@/features/directory/config";
import { createEntraDirectoryClient } from "@/features/directory/entra-directory";
import { loadSmtpConfig } from "@/features/notifications/config";
import { createSmtpMailer } from "@/features/notifications/mailer";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { createInviteToken, hashInviteToken } from "./tokens";

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function requireInviteManager(appRequestId: string) {
  const actorUserId = await resolveCurrentUserId();
  const isAdmin = await userHasAdminRole(actorUserId);
  const appRequest = await prisma.appRequest.findFirst({
    where: isAdmin ? { id: appRequestId } : { id: appRequestId, userId: actorUserId },
    include: { user: true },
  });

  if (!appRequest) {
    throw new Error("Only owners and admins can manage collaboration invites.");
  }

  return { actorUserId, appRequest };
}

function inviteText({
  inviterName,
  appName,
  acceptUrl,
}: {
  inviterName: string;
  appName: string;
  acceptUrl: string;
}) {
  return [
    `${inviterName} invited you to collaborate on ${appName} in the Cedarville App Portal.`,
    `Accept the invitation: ${acceptUrl}`,
    "Accepting grants portal app access only. GitHub repository access is requested separately from the app details page.",
  ].join("\n\n");
}

export async function sendCollaborationInviteAction(
  appRequestId: string,
  formData: FormData,
) {
  const { actorUserId, appRequest } = await requireInviteManager(appRequestId);
  const rawEmail = formData.get("email");

  if (typeof rawEmail !== "string" || rawEmail.trim().length === 0) {
    throw new Error("Email is required.");
  }

  const normalizedEmail = normalizeEmail(rawEmail);
  const directoryConfig = loadDirectoryConfig();
  const directory = createEntraDirectoryClient({
    tokenProvider: async () => {
      const { ClientSecretCredential } = await import("@azure/identity");
      const credential = new ClientSecretCredential(
        directoryConfig.tenantId,
        directoryConfig.clientId,
        directoryConfig.clientSecret,
      );
      const token = await credential.getToken("https://graph.microsoft.com/.default");
      if (!token?.token) {
        throw new Error("Microsoft Graph token was not returned.");
      }
      return token.token;
    },
    allowedEmailDomain: directoryConfig.allowedEmailDomain,
  });
  const eligibleUser = await directory.findEligibleUserByEmail(normalizedEmail);

  if (!eligibleUser) {
    throw new Error("Invitee must be a Cedarville member account.");
  }

  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const smtpConfig = loadSmtpConfig();
  const acceptUrl = `${smtpConfig.appUrl}/invites/${token}`;
  const mailer = createSmtpMailer({ config: smtpConfig });

  const invite = await prisma.collaborationInvite.upsert({
    where: {
      appRequestId_normalizedInvitedEmail: {
        appRequestId,
        normalizedInvitedEmail: normalizedEmail,
      },
    },
    update: {
      invitedEmail: eligibleUser.email,
      invitedEntraOid: eligibleUser.entraOid,
      invitedDisplayName: eligibleUser.displayName,
      inviterUserId: actorUserId,
      status: "PENDING",
      tokenHash,
      expiresAt,
      acceptedAt: null,
      revokedAt: null,
      lastSentAt: new Date(),
    },
    create: {
      appRequestId,
      invitedEmail: eligibleUser.email,
      normalizedInvitedEmail: normalizedEmail,
      invitedEntraOid: eligibleUser.entraOid,
      invitedDisplayName: eligibleUser.displayName,
      inviterUserId: actorUserId,
      status: "PENDING",
      tokenHash,
      expiresAt,
      lastSentAt: new Date(),
    },
  });

  try {
    const text = inviteText({
      inviterName: appRequest.user.displayName,
      appName: appRequest.appName,
      acceptUrl,
    });
    await mailer.send({
      to: eligibleUser.email,
      subject: `${appRequest.user.displayName} invited you to ${appRequest.appName}`,
      text,
      html: text.split("\n\n").map((paragraph) => `<p>${paragraph}</p>`).join(""),
    });
    await prisma.notificationDelivery.create({
      data: {
        appRequestId,
        recipientEmail: eligibleUser.email,
        eventKey: "COLLABORATION_INVITE_SENT",
        category: "COLLABORATION",
        status: "SENT",
        provider: "smtp",
        sentAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.notificationDelivery.create({
      data: {
        appRequestId,
        recipientEmail: eligibleUser.email,
        eventKey: "COLLABORATION_INVITE_SENT",
        category: "COLLABORATION",
        status: "FAILED",
        provider: "smtp",
        errorSummary: error instanceof Error ? error.message : "unknown",
      },
    });
  }

  await recordAuditEvent("COLLABORATION_INVITE_SENT", {
    actorUserId,
    appRequestId,
    supportReference: appRequest.supportReference,
    inviteId: invite.id,
    targetEmail: eligibleUser.email,
  });

  revalidatePath(`/download/${appRequestId}`);
}

export async function revokeCollaborationInviteAction(
  appRequestId: string,
  inviteId: string,
) {
  const { actorUserId, appRequest } = await requireInviteManager(appRequestId);
  const invite = await prisma.collaborationInvite.update({
    where: { id: inviteId },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      tokenHash: hashInviteToken(createInviteToken()),
    },
  });

  await recordAuditEvent("COLLABORATION_INVITE_REVOKED", {
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
  const { actorUserId } = await requireInviteManager(appRequestId);
  const invite = await prisma.collaborationInvite.findFirst({
    where: { id: inviteId, appRequestId, status: "PENDING" },
  });

  if (!invite) {
    throw new Error("Pending invite not found.");
  }

  const formData = new FormData();
  formData.set("email", invite.normalizedInvitedEmail);
  await sendCollaborationInviteAction(appRequestId, formData);
  await recordAuditEvent("COLLABORATION_INVITE_RESENT", {
    actorUserId,
    appRequestId,
    inviteId,
  });
}

export async function acceptCollaborationInviteAction(
  token: string,
  signedInUser: { entraOid?: string; email?: string | null; name?: string | null },
) {
  if (!signedInUser.entraOid || !signedInUser.email) {
    throw new Error("Sign in with the invited Cedarville account to accept this invite.");
  }

  const invite = await prisma.collaborationInvite.findFirst({
    where: {
      tokenHash: hashInviteToken(token),
      status: "PENDING",
    },
  });

  if (!invite || invite.expiresAt <= new Date()) {
    throw new Error("This collaboration invite is no longer valid.");
  }

  const normalizedEmail = normalizeEmail(signedInUser.email);
  if (
    invite.invitedEntraOid !== signedInUser.entraOid &&
    invite.normalizedInvitedEmail !== normalizedEmail
  ) {
    throw new Error("Sign in with the invited Cedarville account to accept this invite.");
  }

  const user = await prisma.user.upsert({
    where: { entraOid: signedInUser.entraOid },
    update: {
      email: normalizedEmail,
      displayName: signedInUser.name ?? normalizedEmail,
    },
    create: {
      entraOid: signedInUser.entraOid,
      email: normalizedEmail,
      displayName: signedInUser.name ?? normalizedEmail,
    },
  });

  await prisma.$transaction(async (tx) => {
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
    await tx.collaborationInvite.update({
      where: { id: invite.id },
      data: {
        status: "ACCEPTED",
        invitedUserId: user.id,
        acceptedAt: new Date(),
      },
    });
  });

  await recordAuditEvent("COLLABORATION_INVITE_ACCEPTED", {
    actorUserId: user.id,
    appRequestId: invite.appRequestId,
    inviteId: invite.id,
  });

  revalidatePath(`/download/${invite.appRequestId}`);

  return invite.appRequestId;
}
```

- [ ] **Step 8: Run invite tests**

Run: `npm test -- src/features/collaboration-invites/tokens.test.ts src/features/collaboration-invites/actions.test.ts`

Expected: PASS. If mocks need extra Prisma methods, add only the methods asserted by the tests.

- [ ] **Step 9: Commit**

```bash
git add src/lib/audit.ts src/features/collaboration-invites
git commit -m "feat: add collaboration invite actions"
```

## Task 7: Add Invite Acceptance Route And App Details Invite UI

**Files:**
- Create: `src/app/invites/[token]/page.tsx`
- Create: `src/app/invites/[token]/page.test.tsx`
- Create: `src/features/collaboration-invites/invite-panel.tsx`
- Create: `src/features/collaboration-invites/invite-panel.test.tsx`
- Modify: `src/app/download/[requestId]/page.tsx`
- Modify: `src/app/download/[requestId]/page.test.tsx`

- [ ] **Step 1: Write failing invite panel test**

Create `src/features/collaboration-invites/invite-panel.test.tsx`:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CollaborationInvitePanel } from "./invite-panel";

describe("CollaborationInvitePanel", () => {
  it("renders send form and pending invite actions", () => {
    render(
      <CollaborationInvitePanel
        appRequestId="request-123"
        pendingInvites={[
          {
            id: "invite-123",
            invitedEmail: "staff@cedarville.edu",
            invitedDisplayName: "Staff User",
            status: "PENDING",
            expiresAt: new Date("2026-07-03T12:00:00Z"),
            lastSentAt: new Date("2026-06-19T12:00:00Z"),
            inviter: { displayName: "Owner User", email: "owner@cedarville.edu" },
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Coworker email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Invite" })).toBeInTheDocument();
    expect(screen.getByText("staff@cedarville.edu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Add invite panel**

Create `src/features/collaboration-invites/invite-panel.tsx`:

```tsx
import React from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import {
  resendCollaborationInviteAction,
  revokeCollaborationInviteAction,
  sendCollaborationInviteAction,
} from "./actions";

type PendingInvite = {
  id: string;
  invitedEmail: string;
  invitedDisplayName: string;
  status: string;
  expiresAt: Date;
  lastSentAt: Date | null;
  inviter: {
    displayName: string;
    email: string;
  };
};

export function CollaborationInvitePanel({
  appRequestId,
  pendingInvites,
}: {
  appRequestId: string;
  pendingInvites: PendingInvite[];
}) {
  const sendAction = sendCollaborationInviteAction.bind(null, appRequestId);

  return (
    <section aria-label="Invite collaborators" className="card">
      <p className="section-title">Invite Collaborators</p>
      <form action={sendAction} className="form-stack">
        <label className="form-label" htmlFor="collaborator-email">
          Coworker email
        </label>
        <input
          id="collaborator-email"
          name="email"
          type="email"
          className="form-input"
          placeholder="name@cedarville.edu"
          required
        />
        <PendingSubmitButton
          idleLabel="Send Invite"
          pendingLabel="Sending Invite..."
          statusText="Checking the Cedarville directory and sending the invite."
          size="sm"
        />
      </form>

      {pendingInvites.length ? (
        <div className="status-table" style={{ marginTop: "1rem" }}>
          {pendingInvites.map((invite) => {
            const resendAction = resendCollaborationInviteAction.bind(
              null,
              appRequestId,
              invite.id,
            );
            const revokeAction = revokeCollaborationInviteAction.bind(
              null,
              appRequestId,
              invite.id,
            );

            return (
              <div className="status-row" key={invite.id}>
                <span className="status-row__label">{invite.invitedDisplayName}</span>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <span>{invite.invitedEmail}</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    Expires {invite.expiresAt.toLocaleDateString()}
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <form action={resendAction}>
                      <PendingSubmitButton
                        idleLabel="Resend"
                        pendingLabel="Resending..."
                        statusText="Resending collaboration invite."
                        variant="ghost"
                        size="sm"
                      />
                    </form>
                    <form action={revokeAction}>
                      <PendingSubmitButton
                        idleLabel="Revoke"
                        pendingLabel="Revoking..."
                        statusText="Revoking collaboration invite."
                        variant="danger"
                        size="sm"
                      />
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: "var(--text-secondary)" }}>No pending invites.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Run invite panel test**

Run: `npm test -- src/features/collaboration-invites/invite-panel.test.tsx`

Expected: PASS.

- [ ] **Step 4: Write failing accept page test**

Create `src/app/invites/[token]/page.test.tsx`:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InviteAcceptPage from "./page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/auth/session", () => ({
  getServerSession: vi.fn(),
  signIn: vi.fn(),
}));
vi.mock("@/features/collaboration-invites/actions", () => ({
  acceptCollaborationInviteAction: vi.fn(),
}));

const { getServerSession } = await import("@/auth/session");
const { acceptCollaborationInviteAction } = await import("@/features/collaboration-invites/actions");

describe("InviteAcceptPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders sign-in prompt when the user is not signed in", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    render(await InviteAcceptPage({ params: Promise.resolve({ token: "token-123" }) }));

    expect(screen.getByText("Sign in to accept this collaboration invite.")).toBeInTheDocument();
  });

  it("accepts the invite and redirects to app details", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        entraOid: "entra-123",
        email: "staff@cedarville.edu",
        name: "Staff User",
      },
    } as never);
    vi.mocked(acceptCollaborationInviteAction).mockResolvedValue("request-123");

    await InviteAcceptPage({ params: Promise.resolve({ token: "token-123" }) });

    expect(redirect).toHaveBeenCalledWith("/download/request-123");
  });
});
```

- [ ] **Step 5: Add accept page**

Create `src/app/invites/[token]/page.tsx`:

```tsx
import React from "react";
import { redirect } from "next/navigation";
import { getServerSession, signIn } from "@/auth/session";
import { acceptCollaborationInviteAction } from "@/features/collaboration-invites/actions";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getServerSession();

  if (!session?.user) {
    async function signInForInvite() {
      "use server";
      await signIn("microsoft-entra-id", { redirectTo: `/invites/${token}` });
    }

    return (
      <main>
        <h1>Accept Collaboration Invite</h1>
        <p>Sign in to accept this collaboration invite.</p>
        <form action={signInForInvite}>
          <button type="submit" className="btn btn--primary-solid">
            Sign In
          </button>
        </form>
      </main>
    );
  }

  const appRequestId = await acceptCollaborationInviteAction(token, {
    entraOid: session.user.entraOid,
    email: session.user.email,
    name: session.user.name,
  });

  redirect(`/download/${appRequestId}`);
}
```

- [ ] **Step 6: Integrate invite panel into app details**

Modify the `prisma.appRequest.findFirst` call in `src/app/download/[requestId]/page.tsx` to include pending invites:

```ts
      collaborationInvites: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        include: {
          inviter: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
      },
```

Add this import:

```ts
import { CollaborationInvitePanel } from "@/features/collaboration-invites/invite-panel";
```

Render the panel only when the current user owns the app or is an admin:

```tsx
      {appRequest.userId === userId || isAdmin ? (
        <CollaborationInvitePanel
          appRequestId={appRequest.id}
          pendingInvites={appRequest.collaborationInvites}
        />
      ) : null}
```

- [ ] **Step 7: Add app details tests for invite controls**

Modify `src/app/download/[requestId]/page.test.tsx` to assert:

```tsx
it("shows collaborator invite controls to owners", async () => {
  vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("owner-123");
  vi.mocked(userHasAdminRole).mockResolvedValue(false);
  mockAppRequest({
    userId: "owner-123",
    collaborationInvites: [],
  });

  render(await DownloadPage({ params: Promise.resolve({ requestId: "request-123" }) }));

  expect(screen.getByLabelText("Invite collaborators")).toBeInTheDocument();
});

it("hides collaborator invite controls from collaborators", async () => {
  vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("collab-123");
  vi.mocked(userHasAdminRole).mockResolvedValue(false);
  mockAppRequest({
    userId: "owner-123",
    collaborationInvites: [],
  });

  render(await DownloadPage({ params: Promise.resolve({ requestId: "request-123" }) }));

  expect(screen.queryByLabelText("Invite collaborators")).not.toBeInTheDocument();
});
```

Use the existing helper shape in `page.test.tsx`; add `collaborationInvites: []` to base mocked app requests so older tests keep passing.

- [ ] **Step 8: Run invite UI tests**

Run: `npm test -- src/features/collaboration-invites/invite-panel.test.tsx 'src/app/invites/[token]/page.test.tsx' 'src/app/download/[requestId]/page.test.tsx'`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/collaboration-invites/invite-panel.tsx src/features/collaboration-invites/invite-panel.test.tsx src/app/invites src/app/download/[requestId]/page.tsx src/app/download/[requestId]/page.test.tsx
git commit -m "feat: add collaborator invite UI"
```

## Task 8: Integrate Notifications Into Existing Actions

**Files:**
- Modify: `src/app/create/actions.ts`
- Modify: `src/features/repositories/actions.ts`
- Modify: `src/features/repository-imports/actions.ts`
- Modify: `src/features/publishing/run-publish-attempt.ts`
- Modify: `src/features/publishing/setup/actions.ts`
- Modify: `src/features/app-deletion/actions.ts`
- Modify: `src/features/admin/actions.ts`
- Modify matching `*.test.ts` files for each action file.

- [ ] **Step 1: Add factory helper for production notifications**

Create `src/features/notifications/production.ts`:

```ts
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
```

- [ ] **Step 2: Add non-throwing wrapper**

Create `src/features/notifications/safe-notify.ts`:

```ts
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
    await recordAuditEvent("NOTIFICATION_DELIVERY_FAILED", {
      appRequestId: input.appRequestId,
      eventKey: input.eventKey,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
```

- [ ] **Step 3: Write action integration tests**

For each modified action test file, mock `safeNotifyAppEvent`:

```ts
vi.mock("@/features/notifications/safe-notify", () => ({
  safeNotifyAppEvent: vi.fn(),
}));
```

Add focused assertions:

```ts
expect(safeNotifyAppEvent).toHaveBeenCalledWith({
  appRequestId: "request-123",
  eventKey: "REPOSITORY_READY",
  actorUserId: "owner-123",
});
```

Use these event mappings:

- `src/app/create/actions.ts`: after generated app succeeds, `APP_CREATED`; after managed repository succeeds, `REPOSITORY_READY`; after repository failure, `REPOSITORY_FAILED`.
- `src/features/repository-imports/actions.ts`: after existing app import succeeds, `EXISTING_APP_IMPORTED`; after preparation verified or committed if it makes repository ready, `REPOSITORY_READY`; after import/preparation failure, `REPOSITORY_FAILED`.
- `src/features/publishing/run-publish-attempt.ts`: after publish succeeds, `PUBLISH_SUCCEEDED`; after publish fails, `PUBLISH_FAILED`; when setup status becomes `NEEDS_REPAIR`, `PUBLISHING_SETUP_NEEDS_REPAIR`; when setup status becomes `BLOCKED`, `PUBLISHING_SETUP_BLOCKED`.
- `src/features/publishing/setup/actions.ts`: after repair marks setup ready, do not send a notification; after repair remains blocked, `PUBLISHING_SETUP_BLOCKED`.
- `src/features/app-deletion/actions.ts`: after portal record deletion succeeds, `APP_DELETED` before the record is removed if possible; if deleted in the same transaction, pass direct owner/collaborator ids to the notification service before destructive delete.
- `src/features/admin/actions.ts`: after owner reassignment, `OWNER_REASSIGNED` with old and new owner as direct recipients; after collaborator added by admin, `APP_SHARED` with added user as direct recipient; after collaborator removed, `COLLABORATOR_REMOVED` with removed user as direct recipient.

- [ ] **Step 4: Modify actions to call safe notification wrapper**

Import in each action file:

```ts
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
```

Call it after the database state change and audit event:

```ts
await safeNotifyAppEvent({
  appRequestId: requestId,
  eventKey: "REPOSITORY_READY",
  actorUserId,
});
```

For actions without an actor id in scope, use the request owner or the current user resolver already used in that action. For worker code that has no interactive actor, omit `actorUserId`.

- [ ] **Step 5: Run focused action tests**

Run:

```bash
npm test -- \
  src/app/create/actions.test.ts \
  src/features/repositories/actions.test.ts \
  src/features/repository-imports/actions.test.ts \
  src/features/publishing/run-publish-attempt.test.ts \
  src/features/publishing/setup/actions.test.ts \
  src/features/app-deletion/actions.test.ts \
  src/features/admin/actions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/notifications/production.ts src/features/notifications/safe-notify.ts src/app/create/actions.ts src/app/create/actions.test.ts src/features/repositories/actions.ts src/features/repositories/actions.test.ts src/features/repository-imports/actions.ts src/features/repository-imports/actions.test.ts src/features/publishing/run-publish-attempt.ts src/features/publishing/run-publish-attempt.test.ts src/features/publishing/setup/actions.ts src/features/publishing/setup/actions.test.ts src/features/app-deletion/actions.ts src/features/app-deletion/actions.test.ts src/features/admin/actions.ts src/features/admin/actions.test.ts
git commit -m "feat: notify app activity events"
```

## Task 9: Documentation And Environment

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/portal/setup.md`

- [ ] **Step 1: Update `.env.example`**

Add:

```txt
# Portal URL used for notification and invite links
PORTAL_APP_URL=http://localhost:3000

# Optional SMTP settings for portal email notifications and collaboration invites
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_TLS_MODE=starttls
SMTP_FROM="Cedarville App Portal <no-reply@cedarville.edu>"
SMTP_REPLY_TO=

# Optional Entra directory lookup settings for Cedarville-only collaboration invites
ENTRA_DIRECTORY_TENANT_ID=
ENTRA_DIRECTORY_CLIENT_ID=
ENTRA_DIRECTORY_CLIENT_SECRET=
ENTRA_ALLOWED_EMAIL_DOMAIN=cedarville.edu
```

- [ ] **Step 2: Update README feature summary**

Add a short paragraph to `README.md` under the current collaboration description:

```md
The portal sends immediate SMTP email notifications for app lifecycle, collaboration, and publishing events. Users can manage notification preferences from Settings, while collaboration invite emails always send because they grant access. Owners and admins can invite Cedarville coworkers by email; invitees must accept through Entra before they become collaborators.
```

- [ ] **Step 3: Update setup docs**

Add a `Notifications And Collaboration Invites` section to `docs/portal/setup.md`:

```md
### Notifications And Collaboration Invites

Set `PORTAL_APP_URL` to the public portal origin used in email links. Configure SMTP with `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS_MODE`, `SMTP_FROM`, and optional username, password, and reply-to values.

Collaboration invites validate coworkers against Entra before sending. Configure `ENTRA_DIRECTORY_TENANT_ID`, `ENTRA_DIRECTORY_CLIENT_ID`, `ENTRA_DIRECTORY_CLIENT_SECRET`, and `ENTRA_ALLOWED_EMAIL_DOMAIN=cedarville.edu`. The directory app registration needs Microsoft Graph permission to read users and alias evidence; the expected app-only permission is `User.Read.All` unless Cedarville validates a narrower delegated or app-only permission path.

Invite acceptance grants portal app access only. Users request GitHub repository access separately from the app details page.
```

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md docs/portal/setup.md
git commit -m "docs: document notification setup"
```

## Task 10: Final Verification

**Files:**
- All modified files.

- [ ] **Step 1: Run full unit suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Review git diff**

Run: `git status --short`

Expected: clean worktree after final commit.

- [ ] **Step 4: Manual smoke checklist**

Run the app locally with configured SMTP and directory test credentials:

```bash
npm run db:up
npm run prisma:migrate:deploy
npm run prisma:seed
npm run dev
```

Expected manual checks:

- Settings page opens for a signed-in user.
- Notification toggles save and remain checked/unchecked after refresh.
- Owner sees invite controls on app details.
- Collaborator does not see invite controls.
- Owner sends a Cedarville invite and sees it in pending invites.
- Invited user accepts through Entra and lands on app details.
- Accepted user appears in the app access summary.
- Accepted user does not automatically receive GitHub repository access.
- Resend and revoke work for pending invites.

- [ ] **Step 5: Final commit if manual smoke changed docs or tests**

If manual smoke creates tracked changes, inspect them. Commit only intentional changes:

```bash
git add <intentional-files>
git commit -m "test: verify collaboration notifications"
```

Expected: no commit is needed when smoke testing only changes local database and ignored artifact files.

## Plan Self-Review

Spec coverage:

- Email notifications are covered in Tasks 2, 3, and 8.
- User preferences and settings page are covered in Task 5.
- Always-send collaboration invites are covered in Tasks 6 and 7.
- Cedarville Entra lookup is covered in Task 4.
- SMTP provider and delivery metadata are covered in Task 3.
- App details invite UI, resend, and revoke are covered in Task 7.
- Documentation and environment variables are covered in Task 9.
- Full verification is covered in Task 10.

Placeholder scan:

- The plan contains no `TBD`, `TODO`, or unresolved placeholder steps.
- Every code-writing step names the target file and includes the exact code shape or exact integration pattern.

Type consistency:

- Prisma enum names match TypeScript event names in `src/features/notifications/types.ts`.
- Preference property names match the Prisma model and settings form input names.
- Invite token helpers are consistently named `createInviteToken` and `hashInviteToken`.
