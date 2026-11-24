CREATE TABLE "AppSecurityReview" (
    "appRequestId" TEXT PRIMARY KEY REFERENCES "AppRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "repositoryUrl" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "results" JSONB NOT NULL
);
