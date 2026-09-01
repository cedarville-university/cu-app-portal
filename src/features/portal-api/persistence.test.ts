import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");

describe("portal API persistence schema", () => {
  it("stores idempotent operations per actor and operation", () => {
    expect(schema).toContain("model PortalApiOperation");
    expect(schema).toContain("@@unique([actorUserId, operation, idempotencyKey])");
    expect(schema).toContain("safeResult       Json?");
    expect(schema).toContain("expiresAt        DateTime");
  });

  it("stores expiring rate-limit events", () => {
    expect(schema).toContain("model PortalApiRateLimitEvent");
    expect(schema).toContain("@@index([actorUserId, action, createdAt])");
    expect(schema).toContain("@@index([expiresAt])");
  });
});
