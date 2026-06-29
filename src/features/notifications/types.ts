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
  OWNER_REASSIGNED: "COLLABORATION",
};
