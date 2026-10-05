import { DefaultAzureCredential } from "@azure/identity";
import type { PrismaClient } from "@prisma/client";
import {
  createAzureArmClient,
  KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID,
} from "@/features/publishing/azure/arm-client";
import { loadAzurePublishConfig } from "@/features/publishing/azure/config";
import { createKeyVaultClient } from "@/features/publishing/azure/key-vault-client";
import {
  buildPublishTargetNames,
  toKeyVaultSecretName,
} from "@/features/publishing/azure/naming";
import { prisma } from "@/lib/db";
import { keyVaultReference } from "./settings";
import {
  normalizeEnvVarKey,
  validateEnvVarKey,
  validateEnvVarValue,
} from "./validation";

export type EnvVarAppRequest = {
  id: string;
  appName: string;
  azureWebAppName: string | null;
  azureKeyVaultName: string | null;
  azureKeyVaultUri: string | null;
};

export type EnvVarServiceDeps = {
  prisma: Pick<PrismaClient, "appRequest" | "appEnvironmentVariable">;
  config: {
    resourceGroup: string;
    location: string;
    azureTenantId: string;
  };
  arm: {
    keyVaultId(resourceGroup: string, name: string): string;
    putKeyVault(input: {
      resourceGroup: string;
      name: string;
      location: string;
      tenantId: string;
      tags: Record<string, string>;
    }): Promise<{ vaultUri: string }>;
    getAppSettings(input: {
      resourceGroup: string;
      name: string;
    }): Promise<{ exists: boolean; settings: Record<string, string> }>;
    putAppSettings(input: {
      resourceGroup: string;
      name: string;
      settings: Record<string, string>;
    }): Promise<void>;
    putRoleAssignment(input: {
      scope: string;
      roleDefinitionId: string;
      principalId: string;
    }): Promise<void>;
    ensureSystemAssignedIdentity(input: {
      resourceGroup: string;
      name: string;
    }): Promise<{ principalId: string }>;
  };
  createKeyVaultClient(vaultUri: string): {
    setSecret(input: { name: string; value: string }): Promise<void>;
    deleteSecret(input: { name: string }): Promise<void>;
  };
};

function createAzureTokenProvider(scope: string) {
  const credential = new DefaultAzureCredential();

  return async () => {
    const token = await credential.getToken(scope);

    if (!token?.token) {
      throw new Error(`Azure token was not available for scope ${scope}.`);
    }

    return token.token;
  };
}

export function createDefaultEnvVarServiceDeps(): EnvVarServiceDeps {
  const config = loadAzurePublishConfig();
  const vaultTokenProvider = createAzureTokenProvider(
    "https://vault.azure.net/.default",
  );

  return {
    prisma,
    config: {
      resourceGroup: config.resourceGroup,
      location: config.location,
      azureTenantId: config.azureTenantId,
    },
    arm: createAzureArmClient({
      subscriptionId: config.azureSubscriptionId,
      tokenProvider: createAzureTokenProvider(
        "https://management.azure.com/.default",
      ),
    }),
    createKeyVaultClient: (vaultUri: string) =>
      createKeyVaultClient({ vaultUri, tokenProvider: vaultTokenProvider }),
  };
}

async function ensureKeyVault(
  deps: EnvVarServiceDeps,
  appRequest: EnvVarAppRequest,
): Promise<{ name: string; uri: string }> {
  if (appRequest.azureKeyVaultName && appRequest.azureKeyVaultUri) {
    return {
      name: appRequest.azureKeyVaultName,
      uri: appRequest.azureKeyVaultUri,
    };
  }

  const names = buildPublishTargetNames({
    requestId: appRequest.id,
    appName: appRequest.appName,
  });
  const vault = await deps.arm.putKeyVault({
    resourceGroup: deps.config.resourceGroup,
    name: names.keyVaultName,
    location: deps.config.location,
    tenantId: deps.config.azureTenantId,
    tags: {
      managedBy: "cu-app-portal",
      appRequestId: appRequest.id,
    },
  });

  await deps.prisma.appRequest.update({
    where: { id: appRequest.id },
    data: {
      azureKeyVaultName: names.keyVaultName,
      azureKeyVaultUri: vault.vaultUri,
    },
  });

  return { name: names.keyVaultName, uri: vault.vaultUri };
}

async function applyLiveSetting(
  deps: EnvVarServiceDeps,
  webAppName: string,
  mutate: (settings: Record<string, string>) => void,
) {
  const current = await deps.arm.getAppSettings({
    resourceGroup: deps.config.resourceGroup,
    name: webAppName,
  });

  if (!current.exists) {
    throw new Error(
      "The Azure app for this request could not be found. Try publishing again first.",
    );
  }

  const settings = { ...current.settings };

  mutate(settings);

  await deps.arm.putAppSettings({
    resourceGroup: deps.config.resourceGroup,
    name: webAppName,
    settings,
  });
}

export type EnvVarChange =
  | { operation: "set"; key: string; value: string; isSecret: boolean }
  | { operation: "delete"; key: string };

export async function saveEnvironmentVariables(
  deps: EnvVarServiceDeps,
  input: { appRequest: EnvVarAppRequest; changes: EnvVarChange[] },
): Promise<Array<{ operation: "set" | "delete"; key: string; isSecret: boolean }>> {
  if (!input.changes.length) return [];

  const existing = await deps.prisma.appEnvironmentVariable.findMany({
    where: { appRequestId: input.appRequest.id },
  });
  const seen = new Set<string>();

  // Validate the entire batch before changing Azure, Key Vault, or database rows.
  for (const change of input.changes) {
    const keyCheck = validateEnvVarKey(change.key);
    if (!keyCheck.ok) throw new Error(keyCheck.error);
    const normalized = normalizeEnvVarKey(change.key);
    if (seen.has(normalized)) {
      throw new Error(`Duplicate variable name "${change.key}" in these changes.`);
    }
    seen.add(normalized);
    const current = existing.find((variable) => variable.key === change.key);
    if (change.operation === "delete") {
      continue;
    }
    const valueCheck = validateEnvVarValue(change.value, change.isSecret);
    if (!valueCheck.ok) throw new Error(valueCheck.error);
    const clash = existing.find((variable) =>
      variable.key !== change.key && normalizeEnvVarKey(variable.key) === normalized,
    );
    if (clash) {
      throw new Error(`A variable with this name already exists as "${clash.key}".`);
    }
    if (current && current.isSecret !== change.isSecret) {
      throw new Error(`"${change.key}" already exists as a ${current.isSecret ? "secret" : "non-secret"} variable. Delete it first to change how it is stored.`);
    }
  }

  // A previous attempt may have saved a deletion before a later operation failed.
  // Treat already-deleted rows as complete so the remaining draft can be retried.
  const changes = input.changes.filter((change) =>
    change.operation === "set" || existing.some((variable) => variable.key === change.key),
  );
  if (!changes.length) return [];

  const secretChanges = changes.filter(
    (change): change is Extract<EnvVarChange, { operation: "set" }> =>
      change.operation === "set" && change.isSecret,
  );
  let vaultUri = input.appRequest.azureKeyVaultUri;
  if (secretChanges.length) {
    const vault = await ensureKeyVault(deps, input.appRequest);
    vaultUri = vault.uri;
    const client = deps.createKeyVaultClient(vault.uri);
    for (const change of secretChanges) {
      await client.setSecret({ name: toKeyVaultSecretName(change.key), value: change.value });
    }
    if (input.appRequest.azureWebAppName) {
      const { principalId } = await deps.arm.ensureSystemAssignedIdentity({
        resourceGroup: deps.config.resourceGroup,
        name: input.appRequest.azureWebAppName,
      });
      await deps.arm.putRoleAssignment({
        scope: deps.arm.keyVaultId(deps.config.resourceGroup, vault.name),
        roleDefinitionId: KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID,
        principalId,
      });
    }
  }

  if (input.appRequest.azureWebAppName) {
    await applyLiveSetting(deps, input.appRequest.azureWebAppName, (settings) => {
      for (const change of changes) {
        if (change.operation === "delete") delete settings[change.key];
        else settings[change.key] = change.isSecret
          ? keyVaultReference(vaultUri as string, change.key)
          : change.value;
      }
    });
  }

  const applied = [];
  for (const change of changes) {
    const where = { appRequestId_key: { appRequestId: input.appRequest.id, key: change.key } };
    if (change.operation === "delete") {
      const current = existing.find((variable) => variable.key === change.key)!;
      if (current.isSecret && vaultUri) {
        await deps.createKeyVaultClient(vaultUri).deleteSecret({ name: toKeyVaultSecretName(change.key) });
      }
      await deps.prisma.appEnvironmentVariable.delete({ where });
      applied.push({ operation: change.operation, key: change.key, isSecret: current.isSecret });
    } else {
      const data = { isSecret: change.isSecret, value: change.isSecret ? null : change.value };
      await deps.prisma.appEnvironmentVariable.upsert({
        where,
        create: { appRequestId: input.appRequest.id, key: change.key, ...data },
        update: data,
      });
      applied.push({ operation: change.operation, key: change.key, isSecret: change.isSecret });
    }
  }
  return applied;
}

export async function saveEnvironmentVariable(
  deps: EnvVarServiceDeps,
  input: { appRequest: EnvVarAppRequest; key: string; value: string; isSecret: boolean },
) {
  await saveEnvironmentVariables(deps, {
    appRequest: input.appRequest,
    changes: [{ operation: "set", key: input.key, value: input.value, isSecret: input.isSecret }],
  });
}

export async function deleteEnvironmentVariable(
  deps: EnvVarServiceDeps,
  input: { appRequest: EnvVarAppRequest; key: string },
): Promise<{ isSecret: boolean }> {
  const [deleted] = await saveEnvironmentVariables(deps, {
    appRequest: input.appRequest,
    changes: [{ operation: "delete", key: input.key }],
  });
  if (!deleted) throw new Error(`Variable "${input.key}" was not found.`);
  return { isSecret: deleted.isSecret };
}
