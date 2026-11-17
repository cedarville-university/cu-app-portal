CREATE TABLE "AppMcpConfiguration" (
  "appRequestId" TEXT NOT NULL,
  "profileVersion" TEXT NOT NULL DEFAULT '1.0',
  "endpointUrl" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "applicationObjectId" TEXT,
  "applicationClientId" TEXT,
  "servicePrincipalId" TEXT,
  "scopeId" TEXT,
  "setupStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "failureCode" TEXT,
  "checkedAt" TIMESTAMP(3),
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "probeStatus" TEXT NOT NULL DEFAULT 'NOT_CHECKED',
  "probeAttemptId" TEXT,
  "probeCommitSha" TEXT,
  "probeCheckedAt" TIMESTAMP(3),
  CONSTRAINT "AppMcpConfiguration_pkey" PRIMARY KEY ("appRequestId"),
  CONSTRAINT "AppMcpConfiguration_appRequestId_fkey" FOREIGN KEY ("appRequestId") REFERENCES "AppRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AppMcpConfiguration_applicationObjectId_key" ON "AppMcpConfiguration"("applicationObjectId");
CREATE UNIQUE INDEX "AppMcpConfiguration_applicationClientId_key" ON "AppMcpConfiguration"("applicationClientId");
CREATE UNIQUE INDEX "AppMcpConfiguration_servicePrincipalId_key" ON "AppMcpConfiguration"("servicePrincipalId");
