CREATE TYPE "RepositoryAccessGrantStatus" AS ENUM ('PENDING', 'INVITED', 'GRANTED', 'FAILED');

CREATE TABLE "RepositoryAccessGrant" (
  "id" TEXT NOT NULL,
  "appRequestId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "githubUsername" TEXT NOT NULL,
  "status" "RepositoryAccessGrantStatus" NOT NULL DEFAULT 'PENDING',
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RepositoryAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepositoryAccessGrant_appRequestId_actorUserId_githubUsername_key"
  ON "RepositoryAccessGrant"("appRequestId", "actorUserId", "githubUsername");
CREATE INDEX "RepositoryAccessGrant_appRequestId_actorUserId_revokedAt_idx"
  ON "RepositoryAccessGrant"("appRequestId", "actorUserId", "revokedAt");
CREATE INDEX "RepositoryAccessGrant_actorUserId_idx"
  ON "RepositoryAccessGrant"("actorUserId");

ALTER TABLE "RepositoryAccessGrant" ADD CONSTRAINT "RepositoryAccessGrant_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "RepositoryAccessGrant" (
  "id",
  "appRequestId",
  "actorUserId",
  "githubUsername",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT DISTINCT ON (
  details->>'requestId',
  details->>'actorUserId',
  lower(trim(details->>'githubUsername'))
)
  concat('legacy_', id),
  details->>'requestId',
  details->>'actorUserId',
  lower(trim(details->>'githubUsername')),
  CASE
    WHEN event = 'REPOSITORY_ACCESS_REQUESTED'
      THEN 'PENDING'::"RepositoryAccessGrantStatus"
    WHEN details->>'accessStatus' = 'GRANTED'
      THEN 'GRANTED'::"RepositoryAccessGrantStatus"
    ELSE 'INVITED'::"RepositoryAccessGrantStatus"
  END,
  "createdAt",
  "createdAt"
FROM "AuditLog"
WHERE event IN ('REPOSITORY_ACCESS_REQUESTED', 'REPOSITORY_ACCESS_SUCCEEDED')
  AND coalesce(details->>'requestId', '') <> ''
  AND coalesce(details->>'actorUserId', '') <> ''
  AND coalesce(trim(details->>'githubUsername'), '') <> ''
  AND EXISTS (
    SELECT 1
    FROM "User"
    WHERE "User"."id" = details->>'actorUserId'
  )
ORDER BY
  details->>'requestId',
  details->>'actorUserId',
  lower(trim(details->>'githubUsername')),
  "createdAt" DESC;
