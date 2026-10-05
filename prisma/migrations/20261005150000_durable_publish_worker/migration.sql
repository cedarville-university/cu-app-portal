ALTER TABLE "PublishAttempt"
  ADD COLUMN "actorUserId" TEXT,
  ADD COLUMN "workerToken" TEXT,
  ADD COLUMN "workerLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "workerHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN "dispatchStartedAt" TIMESTAMP(3);
CREATE INDEX "PublishAttempt_status_workerLeaseExpiresAt_idx" ON "PublishAttempt"("status", "workerLeaseExpiresAt");
CREATE INDEX "PublishAttempt_appRequestId_createdAt_idx" ON "PublishAttempt"("appRequestId", "createdAt");
