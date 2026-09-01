import { describe, expect, it } from "vitest";
import { PortalApiError } from "./errors";
import {
  claimPortalRateLimit,
  createPrismaPortalRateLimitDatabase,
  loadPortalApiRateLimits,
  PORTAL_API_RATE_LIMITS,
  type PortalRateLimitDatabase,
} from "./rate-limit";

class InMemoryRateLimitDatabase implements PortalRateLimitDatabase {
  readonly advisoryLocks: string[] = [];
  readonly events: Array<{
    actorUserId: string;
    action: string;
    createdAt: Date;
    expiresAt: Date;
  }> = [];

  async $transaction<TResult>(callback: (tx: this) => Promise<TResult>) {
    return callback(this);
  }

  async advisoryLock(actorUserId: string, action: string) {
    this.advisoryLocks.push(`${actorUserId}:${action}`);
  }

  async deleteExpired(actorUserId: string, action: string, now: Date) {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index];
      if (event?.actorUserId === actorUserId && event.action === action && event.expiresAt <= now) {
        this.events.splice(index, 1);
      }
    }
  }

  async countSince(actorUserId: string, action: string, since: Date) {
    return this.events.filter(
      (event) => event.actorUserId === actorUserId && event.action === action && event.createdAt >= since,
    ).length;
  }

  async oldestSince(actorUserId: string, action: string, since: Date) {
    return this.events
      .filter(
        (event) => event.actorUserId === actorUserId && event.action === action && event.createdAt >= since,
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0] ?? null;
  }

  async create(event: { actorUserId: string; action: string; createdAt: Date; expiresAt: Date }) {
    this.events.push(event);
  }
}

describe("portal API rate-limit policies", () => {
  it("uses all six approved policies", () => {
    expect(PORTAL_API_RATE_LIMITS).toEqual({
      read: { limit: 120, windowSeconds: 600 },
      create_app: { limit: 3, windowSeconds: 3600 },
      request_github_access: { limit: 10, windowSeconds: 3600 },
      publish_app_to_azure: { limit: 6, windowSeconds: 3600 },
      repair_publishing_setup: { limit: 3, windowSeconds: 3600 },
      retry_publish: { limit: 6, windowSeconds: 3600 },
    });
  });

  it("enforces the N+1 rolling-window limit for every policy", async () => {
    const now = new Date("2026-09-01T16:00:00.000Z");

    for (const [action, policy] of Object.entries(PORTAL_API_RATE_LIMITS) as Array<
      [keyof typeof PORTAL_API_RATE_LIMITS, (typeof PORTAL_API_RATE_LIMITS)[keyof typeof PORTAL_API_RATE_LIMITS]]
    >) {
      const db = new InMemoryRateLimitDatabase();
      for (let index = 0; index < policy.limit; index += 1) {
        await claimPortalRateLimit("user-1", action, now, db);
      }

      await expect(claimPortalRateLimit("user-1", action, now, db)).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof PortalApiError &&
          error.code === "RATE_LIMITED" &&
          error.retryAfterSeconds !== null &&
          error.retryAfterSeconds > 0,
      );
      expect(db.advisoryLocks).toHaveLength(policy.limit + 1);
    }
  });

  it("issues the PostgreSQL advisory lock inside the default Prisma transaction", async () => {
    const order: string[] = [];
    const rawQueries: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      async $transaction<TResult>(callback: (transaction: unknown) => Promise<TResult>) {
        order.push("transaction:start");
        const result = await callback({
          async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
            order.push("advisory-lock");
            rawQueries.push({ sql: strings.join("?"), values });
          },
          portalApiRateLimitEvent: {
            async deleteMany() { order.push("delete-expired"); },
            async count() { order.push("count"); return 0; },
            async findFirst() { order.push("oldest"); return null; },
            async create() { order.push("create"); },
          },
        });
        order.push("transaction:commit");
        return result;
      },
    };

    await claimPortalRateLimit(
      "user-1",
      "create_app",
      new Date("2026-09-01T16:00:00.000Z"),
      createPrismaPortalRateLimitDatabase(client),
    );

    expect(order).toEqual([
      "transaction:start",
      "advisory-lock",
      "delete-expired",
      "count",
      "create",
      "transaction:commit",
    ]);
    expect(rawQueries).toEqual([
      {
        sql: expect.stringContaining("SELECT pg_advisory_xact_lock(hashtextextended(?"),
        values: ["user-1:create_app"],
      },
    ]);
  });

  it("cleans expired rows before counting a new event", async () => {
    const db = new InMemoryRateLimitDatabase();
    const now = new Date("2026-09-01T16:00:00.000Z");
    db.events.push({
      actorUserId: "user-1",
      action: "create_app",
      createdAt: new Date("2026-09-01T14:00:00.000Z"),
      expiresAt: new Date("2026-09-01T15:00:00.000Z"),
    });

    await claimPortalRateLimit("user-1", "create_app", now, db);

    expect(db.events).toEqual([
      expect.objectContaining({
        actorUserId: "user-1",
        action: "create_app",
        expiresAt: new Date("2026-09-01T17:00:00.000Z"),
      }),
    ]);
  });

  it("only accepts lower positive integer limit overrides", () => {
    expect(loadPortalApiRateLimits({ PORTAL_MCP_RATE_CREATE_MAX: "2" }).create_app.limit).toBe(2);
    expect(() => loadPortalApiRateLimits({ PORTAL_MCP_RATE_CREATE_MAX: "4" })).toThrow(
      "positive integer",
    );
    expect(() => loadPortalApiRateLimits({ PORTAL_MCP_RATE_CREATE_MAX: "1.5" })).toThrow(
      "positive integer",
    );
  });
});
