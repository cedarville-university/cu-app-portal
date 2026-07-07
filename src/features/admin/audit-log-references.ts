import { prisma } from "@/lib/db";

export const AUDIT_USER_ID_KEYS = [
  "actorUserId",
  "targetUserId",
  "userId",
  "oldOwnerUserId",
  "newOwnerUserId",
  "invitedUserId",
] as const;

export const AUDIT_APP_ID_KEYS = ["appRequestId", "requestId"] as const;

export const AUDIT_ENTRA_OID_KEYS = ["entraOid"] as const;

export type AuditReferenceLabels = {
  users: Map<string, { displayName: string; email: string }>;
  apps: Map<string, { appName: string }>;
  usersByEntraOid: Map<
    string,
    { id: string; displayName: string; email: string }
  >;
};

export function collectAuditReferenceIds(detailsList: unknown[]): {
  userIds: string[];
  appRequestIds: string[];
  entraOids: string[];
} {
  const userIds = new Set<string>();
  const appRequestIds = new Set<string>();
  const entraOids = new Set<string>();

  for (const details of detailsList) {
    if (!details || typeof details !== "object" || Array.isArray(details)) {
      continue;
    }

    const record = details as Record<string, unknown>;

    for (const key of AUDIT_USER_ID_KEYS) {
      const value = record[key];
      if (typeof value === "string") {
        userIds.add(value);
      }
    }

    for (const key of AUDIT_APP_ID_KEYS) {
      const value = record[key];
      if (typeof value === "string") {
        appRequestIds.add(value);
      }
    }

    for (const key of AUDIT_ENTRA_OID_KEYS) {
      const value = record[key];
      if (typeof value === "string") {
        entraOids.add(value);
      }
    }
  }

  return {
    userIds: [...userIds],
    appRequestIds: [...appRequestIds],
    entraOids: [...entraOids],
  };
}

export async function resolveAuditReferences(
  detailsList: unknown[],
): Promise<AuditReferenceLabels> {
  const { userIds, appRequestIds, entraOids } =
    collectAuditReferenceIds(detailsList);

  const [users, apps, entraUsers] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, email: true },
        })
      : Promise.resolve([]),
    appRequestIds.length > 0
      ? prisma.appRequest.findMany({
          where: { id: { in: appRequestIds } },
          select: { id: true, appName: true },
        })
      : Promise.resolve([]),
    entraOids.length > 0
      ? prisma.user.findMany({
          where: { entraOid: { in: entraOids } },
          select: { id: true, entraOid: true, displayName: true, email: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    users: new Map(
      users.map((user) => [
        user.id,
        { displayName: user.displayName, email: user.email },
      ]),
    ),
    apps: new Map(apps.map((app) => [app.id, { appName: app.appName }])),
    usersByEntraOid: new Map(
      entraUsers.map((user) => [
        user.entraOid,
        { id: user.id, displayName: user.displayName, email: user.email },
      ]),
    ),
  };
}
