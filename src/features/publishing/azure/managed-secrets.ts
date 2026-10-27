import { keyVaultReference } from "@/features/env-vars/settings";
import { KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID } from "./arm-client";
import type { createAzureArmClient } from "./arm-client";
import type { AzurePublishConfig } from "./config";
import type { DatabaseProvider } from "@/features/templates/types";
import { buildPublishTargetNames, toKeyVaultSecretName } from "./naming";

export const MANAGED_SECRET_SETTING_NAMES: ReadonlySet<string> = new Set([
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET",
]);

export type AppSecretStoreDeps = {
  config: Pick<AzurePublishConfig, "resourceGroup" | "location" | "azureTenantId">;
  arm: Pick<
    ReturnType<typeof createAzureArmClient>,
    | "putKeyVault"
    | "keyVaultId"
    | "ensureSystemAssignedIdentity"
    | "putRoleAssignment"
  >;
  createKeyVaultClient(vaultUri: string): {
    setSecret(input: { name: string; value: string }): Promise<void>;
  };
};

export function managedSecretValues(
  config: AzurePublishConfig,
  features: {
    databaseProvider: DatabaseProvider;
    databaseName: string;
    entraLogin: boolean;
  },
): Record<string, string> {
  const values: Record<string, string> = {};
  if (features.databaseProvider === "postgresql") {
    values.DATABASE_URL = `postgresql://${encodeURIComponent(config.postgresAdminUser)}:${encodeURIComponent(config.postgresAdminPassword)}@${config.postgresServer}.postgres.database.azure.com:5432/${features.databaseName}?sslmode=require`;
  }
  if (features.entraLogin) {
    values.AUTH_SECRET = config.authSecret;
    values.AUTH_MICROSOFT_ENTRA_ID_SECRET = config.entraClientSecret;
  }
  return values;
}

// Callers must publish these references only after every secret write succeeds.
export async function configureAppSecretStore(input: {
  deps: AppSecretStoreDeps;
  appRequest: {
    id: string;
    appName: string;
    azureKeyVaultName: string | null;
    azureKeyVaultUri: string | null;
  };
  webAppName: string;
  webAppPrincipalId?: string;
  tags: Record<string, string>;
  secrets: Record<string, string>;
  hasUserSecrets?: boolean;
  authorizeProviderMutation?: () => Promise<void>;
  onVaultReady(metadata: {
    azureKeyVaultName: string;
    azureKeyVaultUri: string;
  }): Promise<void>;
}) {
  const { deps, appRequest, authorizeProviderMutation } = input;
  const needsVault = input.hasUserSecrets || Object.keys(input.secrets).length > 0;
  let vaultName = appRequest.azureKeyVaultName;
  let vaultUri = appRequest.azureKeyVaultUri;
  const settings: Record<string, string> = {};

  if (needsVault) {
    vaultName ??= buildPublishTargetNames({
      requestId: appRequest.id,
      appName: appRequest.appName,
    }).keyVaultName;
    await authorizeProviderMutation?.();
    const vault = await deps.arm.putKeyVault({
      resourceGroup: deps.config.resourceGroup,
      name: vaultName,
      location: deps.config.location,
      tenantId: deps.config.azureTenantId,
      tags: input.tags,
    });
    vaultUri = vault.vaultUri;
    // Track the resource before any later provider failure so deletion/retry can find it.
    await input.onVaultReady({
      azureKeyVaultName: vaultName,
      azureKeyVaultUri: vaultUri,
    });
  }

  if (vaultName && vaultUri) {
    let principalId = input.webAppPrincipalId;
    if (!principalId) {
      await authorizeProviderMutation?.();
      principalId = (
        await deps.arm.ensureSystemAssignedIdentity({
          resourceGroup: deps.config.resourceGroup,
          name: input.webAppName,
        })
      ).principalId;
    }
    await authorizeProviderMutation?.();
    await deps.arm.putRoleAssignment({
      scope: deps.arm.keyVaultId(deps.config.resourceGroup, vaultName),
      roleDefinitionId: KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID,
      principalId,
    });
    const client = deps.createKeyVaultClient(vaultUri);
    for (const [key, value] of Object.entries(input.secrets)) {
      await authorizeProviderMutation?.();
      await client.setSecret({ name: toKeyVaultSecretName(key), value });
      settings[key] = keyVaultReference(vaultUri, key);
    }
  }

  return { azureKeyVaultName: vaultName, azureKeyVaultUri: vaultUri, settings };
}
