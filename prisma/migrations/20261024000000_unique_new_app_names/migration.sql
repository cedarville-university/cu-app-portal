-- Do not backfill: existing apps may already share a name.
ALTER TABLE "AppRequest" ADD COLUMN "appNameKey" TEXT;
CREATE UNIQUE INDEX "AppRequest_appNameKey_key" ON "AppRequest"("appNameKey");
