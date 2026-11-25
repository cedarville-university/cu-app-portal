CREATE TABLE "AppDependencyReview" (
    "appRequestId" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "dependency" JSONB NOT NULL,
    CONSTRAINT "AppDependencyReview_pkey" PRIMARY KEY ("appRequestId", "repository"),
    CONSTRAINT "AppDependencyReview_appRequestId_fkey" FOREIGN KEY ("appRequestId")
      REFERENCES "AppRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
