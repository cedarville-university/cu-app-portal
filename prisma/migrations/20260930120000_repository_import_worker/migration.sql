CREATE TYPE "RepositoryImportAttemptStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED'
);

CREATE TYPE "RepositoryImportAttemptStage" AS ENUM (
  'ENQUEUE',
  'CLAIM',
  'CREATE_TARGET',
  'TARGET_TOKEN',
  'SOURCE_TOKEN',
  'CLONE',
  'PUSH',
  'SET_DEFAULT_BRANCH',
  'COMPLETE'
);

ALTER TABLE "RepositoryImport" ADD COLUMN "activeAttemptId" TEXT;

CREATE TABLE "RepositoryImportAttempt" (
  "id" TEXT NOT NULL,
  "repositoryImportId" TEXT NOT NULL,
  "status" "RepositoryImportAttemptStatus" NOT NULL,
  "stage" "RepositoryImportAttemptStage" NOT NULL,
  "errorSummary" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "workerExecutionName" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "lastDeliveryCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RepositoryImportAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepositoryImport_activeAttemptId_key"
  ON "RepositoryImport"("activeAttemptId");
CREATE INDEX "RepositoryImportAttempt_repositoryImportId_createdAt_idx"
  ON "RepositoryImportAttempt"("repositoryImportId", "createdAt");
CREATE INDEX "RepositoryImportAttempt_status_leaseExpiresAt_idx"
  ON "RepositoryImportAttempt"("status", "leaseExpiresAt");

ALTER TABLE "RepositoryImportAttempt"
  ADD CONSTRAINT "RepositoryImportAttempt_repositoryImportId_fkey"
  FOREIGN KEY ("repositoryImportId") REFERENCES "RepositoryImport"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepositoryImport"
  ADD CONSTRAINT "RepositoryImport_activeAttemptId_fkey"
  FOREIGN KEY ("activeAttemptId") REFERENCES "RepositoryImportAttempt"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
