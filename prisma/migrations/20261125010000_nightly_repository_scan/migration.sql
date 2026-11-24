CREATE TABLE "NightlyRepositoryScan" (
    "repository" TEXT PRIMARY KEY,
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease" TEXT,
    "cycle" TIMESTAMP(3),
    "targetSha" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "successfulSha" TEXT,
    "source" JSONB,
    "lastError" TEXT
);

-- Reuse completed, commit-specific results already saved by the pilot.
INSERT INTO "NightlyRepositoryScan" ("repository", "successfulSha", "source")
SELECT DISTINCT ON (lower(r."repositoryUrl")) lower(r."repositoryUrl"),
       r.results->>'revision', r.results->'source'
FROM "AppSecurityReview" r JOIN "AppRequest" a
  ON a.id = r."appRequestId" AND a."repositoryUrl" = r."repositoryUrl"
WHERE r.results->>'revision' ~ '^[0-9a-f]{40}$'
  AND r.results->'source'->'complete' = 'true'::jsonb
  AND r.results->'source'->>'scannedFiles' ~ '^[1-9][0-9]*$'
ORDER BY lower(r."repositoryUrl"), (r.results->'source'->>'checkedAt')::timestamptz DESC;
