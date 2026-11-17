import type { Prisma } from "@prisma/client";

export type AuditContextDb = {
  user: {
    findUnique(args: Prisma.UserFindUniqueArgs): Promise<{ email: string } | null>;
  };
  appRequest: {
    findUnique(args: Prisma.AppRequestFindUniqueArgs): Promise<{ appName: string } | null>;
  };
};

function firstString(details: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

// Snapshot names while records still exist. Context lookup failures must not
// discard the event or weaken callers that require durable audit persistence.
export async function enrichAuditDetails(
  details: Record<string, unknown>,
  db: AuditContextDb,
): Promise<Record<string, unknown>> {
  const userId = firstString(details, ["actorUserId", "userId", "targetUserId", "invitedUserId", "newOwnerUserId", "oldOwnerUserId"]);
  const entraOid = firstString(details, ["entraOid"]);
  const appId = firstString(details, ["appRequestId", "requestId", "appId"]);
  let username = firstString(details, ["username"]);
  let appName = firstString(details, ["appName"]);

  await Promise.all([
    (async () => {
      if (username) return;
      if (!userId && !entraOid) { username = "System"; return; }
      try {
        const user = await db.user.findUnique({
          where: userId ? { id: userId } : { entraOid: entraOid! },
          select: { email: true },
        });
        username = user?.email?.split("@")[0] ?? null;
      } catch { /* Keep the event when context is unavailable. */ }
    })(),
    (async () => {
      if (appName || !appId) return;
      try {
        const app = await db.appRequest.findUnique({ where: { id: appId }, select: { appName: true } });
        appName = app?.appName ?? null;
      } catch { /* Keep the event when context is unavailable. */ }
    })(),
  ]);
  return { ...details, username, appName };
}
