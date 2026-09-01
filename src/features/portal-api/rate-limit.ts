import { prisma } from "@/lib/db";
import { PortalApiError } from "./errors";

export const PORTAL_API_RATE_LIMITS = {
  read: { limit: 120, windowSeconds: 600 },
  create_app: { limit: 3, windowSeconds: 3600 },
  request_github_access: { limit: 10, windowSeconds: 3600 },
  publish_app_to_azure: { limit: 6, windowSeconds: 3600 },
  repair_publishing_setup: { limit: 3, windowSeconds: 3600 },
  retry_publish: { limit: 6, windowSeconds: 3600 },
} as const;

export type PortalRateLimitAction = keyof typeof PORTAL_API_RATE_LIMITS;
export type PortalRateLimitPolicy = { limit: number; windowSeconds: number };
export type PortalApiRateLimits = Record<PortalRateLimitAction, PortalRateLimitPolicy>;

export interface PortalRateLimitTransaction {
  advisoryLock(actorUserId: string, action: PortalRateLimitAction): Promise<void>;
  deleteExpired(actorUserId: string, action: PortalRateLimitAction, now: Date): Promise<void>;
  countSince(actorUserId: string, action: PortalRateLimitAction, since: Date): Promise<number>;
  oldestSince(
    actorUserId: string,
    action: PortalRateLimitAction,
    since: Date,
  ): Promise<{ createdAt: Date } | null>;
  create(event: { actorUserId: string; action: PortalRateLimitAction; createdAt: Date; expiresAt: Date }): Promise<void>;
}

export interface PortalRateLimitDatabase {
  $transaction<TResult>(
    callback: (transaction: PortalRateLimitTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

const rateLimitOverrideNames: Record<PortalRateLimitAction, string> = {
  read: "PORTAL_MCP_RATE_READ_MAX",
  create_app: "PORTAL_MCP_RATE_CREATE_MAX",
  request_github_access: "PORTAL_MCP_RATE_GITHUB_ACCESS_MAX",
  publish_app_to_azure: "PORTAL_MCP_RATE_PUBLISH_MAX",
  repair_publishing_setup: "PORTAL_MCP_RATE_REPAIR_MAX",
  retry_publish: "PORTAL_MCP_RATE_RETRY_MAX",
};

export function loadPortalApiRateLimits(
  env: Record<string, string | undefined> = process.env,
): PortalApiRateLimits {
  return Object.fromEntries(
    (Object.keys(PORTAL_API_RATE_LIMITS) as PortalRateLimitAction[]).map((action) => {
      const defaultPolicy = PORTAL_API_RATE_LIMITS[action];
      const configured = env[rateLimitOverrideNames[action]];
      if (configured === undefined || configured === "") return [action, { ...defaultPolicy }];

      const limit = Number(configured);
      if (!Number.isInteger(limit) || limit <= 0 || limit > defaultPolicy.limit) {
        throw new Error(
          `${rateLimitOverrideNames[action]} must be a positive integer no greater than ${defaultPolicy.limit}.`,
        );
      }
      return [action, { limit, windowSeconds: defaultPolicy.windowSeconds }];
    }),
  ) as PortalApiRateLimits;
}

const defaultDatabase: PortalRateLimitDatabase = {
  $transaction(callback) {
    return prisma.$transaction(async (transaction) =>
      callback({
        async advisoryLock(actorUserId, action) {
          await transaction.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtextextended(${`${actorUserId}:${action}`}, 0))
          `;
        },
        async deleteExpired(actorUserId, action, now) {
          await transaction.portalApiRateLimitEvent.deleteMany({
            where: { actorUserId, action, expiresAt: { lte: now } },
          });
        },
        countSince(actorUserId, action, since) {
          return transaction.portalApiRateLimitEvent.count({
            where: { actorUserId, action, createdAt: { gte: since } },
          });
        },
        oldestSince(actorUserId, action, since) {
          return transaction.portalApiRateLimitEvent.findFirst({
            where: { actorUserId, action, createdAt: { gte: since } },
            select: { createdAt: true },
            orderBy: { createdAt: "asc" },
          });
        },
        async create(event) {
          await transaction.portalApiRateLimitEvent.create({ data: event });
        },
      }),
    );
  },
};

export async function claimPortalRateLimit(
  actorUserId: string,
  action: PortalRateLimitAction,
  now = new Date(),
  db: PortalRateLimitDatabase = defaultDatabase,
): Promise<void> {
  const policy = loadPortalApiRateLimits()[action];
  const windowStart = new Date(now.getTime() - policy.windowSeconds * 1000);
  const windowEnd = new Date(now.getTime() + policy.windowSeconds * 1000);

  await db.$transaction(async (transaction) => {
    await transaction.advisoryLock(actorUserId, action);
    await transaction.deleteExpired(actorUserId, action, now);

    const count = await transaction.countSince(actorUserId, action, windowStart);
    if (count >= policy.limit) {
      const oldest = await transaction.oldestSince(actorUserId, action, windowStart);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((oldest?.createdAt.getTime() ?? now.getTime()) + policy.windowSeconds * 1000 - now.getTime()) / 1000),
      );
      throw new PortalApiError(
        "RATE_LIMITED",
        "Too many requests. Try again after the retry period.",
        retryAfterSeconds,
      );
    }

    await transaction.create({
      actorUserId,
      action,
      createdAt: now,
      expiresAt: windowEnd,
    });
  });
}
