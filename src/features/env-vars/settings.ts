import { toKeyVaultSecretName } from "@/features/publishing/azure/naming";

export type EnvVarForSettings = {
  key: string;
  isSecret: boolean;
  value: string | null;
};

export function keyVaultReference(vaultUri: string, key: string) {
  const baseUrl = vaultUri.replace(/\/+$/, "");

  return `@Microsoft.KeyVault(SecretUri=${baseUrl}/secrets/${toKeyVaultSecretName(key)})`;
}

export function buildUserAppSettings(
  envVars: EnvVarForSettings[],
  vaultUri: string | null,
): Record<string, string> {
  const settings: Record<string, string> = {};

  for (const envVar of envVars) {
    if (envVar.isSecret) {
      if (!vaultUri) {
        throw new Error(
          `Secret variable ${envVar.key} exists but the app has no Key Vault.`,
        );
      }

      settings[envVar.key] = keyVaultReference(vaultUri, envVar.key);
    } else {
      settings[envVar.key] = envVar.value ?? "";
    }
  }

  return settings;
}
