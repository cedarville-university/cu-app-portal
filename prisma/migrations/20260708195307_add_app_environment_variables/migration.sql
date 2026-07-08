-- AlterTable
ALTER TABLE "AppRequest" ADD COLUMN     "azureKeyVaultName" TEXT,
ADD COLUMN     "azureKeyVaultUri" TEXT;

-- CreateTable
CREATE TABLE "AppEnvironmentVariable" (
    "id" TEXT NOT NULL,
    "appRequestId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppEnvironmentVariable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppEnvironmentVariable_appRequestId_key_key" ON "AppEnvironmentVariable"("appRequestId", "key");

-- AddForeignKey
ALTER TABLE "AppEnvironmentVariable" ADD CONSTRAINT "AppEnvironmentVariable_appRequestId_fkey" FOREIGN KEY ("appRequestId") REFERENCES "AppRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
