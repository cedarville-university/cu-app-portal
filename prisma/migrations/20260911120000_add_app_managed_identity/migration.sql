-- AlterTable
ALTER TABLE "AppRequest" ADD COLUMN     "azureManagedIdentityName" TEXT,
ADD COLUMN     "azureManagedIdentityClientId" TEXT;
