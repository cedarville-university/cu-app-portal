CREATE TYPE "PortalApiOperationState" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "PortalApiOperation" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "inputDigest" TEXT NOT NULL,
  "state" "PortalApiOperationState" NOT NULL DEFAULT 'PENDING',
  "appRequestId" TEXT,
  "publishAttemptId" TEXT,
  "safeResult" JSONB,
  "errorCode" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PortalApiOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortalApiRateLimitEvent" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PortalApiRateLimitEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalApiOperation_actorUserId_operation_idempotencyKey_key"
  ON "PortalApiOperation"("actorUserId", "operation", "idempotencyKey");
CREATE INDEX "PortalApiOperation_expiresAt_idx" ON "PortalApiOperation"("expiresAt");
CREATE INDEX "PortalApiRateLimitEvent_actorUserId_action_createdAt_idx"
  ON "PortalApiRateLimitEvent"("actorUserId", "action", "createdAt");
CREATE INDEX "PortalApiRateLimitEvent_expiresAt_idx" ON "PortalApiRateLimitEvent"("expiresAt");

ALTER TABLE "PortalApiOperation" ADD CONSTRAINT "PortalApiOperation_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalApiRateLimitEvent" ADD CONSTRAINT "PortalApiRateLimitEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
