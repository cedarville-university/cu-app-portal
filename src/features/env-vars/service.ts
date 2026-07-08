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

export async function saveEnvironmentVariable(
  deps: EnvVarServiceDeps,
  input: {
    appRequest: EnvVarAppRequest;
    key: string;
    value: string;
    isSecret: boolean;
  },
) {
  const keyCheck = validateEnvVarKey(input.key);

  if (!keyCheck.ok) {
    throw new Error(keyCheck.error);
  }

  const valueCheck = validateEnvVarValue(input.value, input.isSecret);

  if (!valueCheck.ok) {
    throw new Error(valueCheck.error);
  }

  const existing = await deps.prisma.appEnvironmentVariable.findMany({
    where: { appRequestId: input.appRequest.id },
  });
  const clash = existing.find(
    (variable) =>
      variable.key !== input.key &&
      normalizeEnvVarKey(variable.key) === normalizeEnvVarKey(input.key),
  );

  if (clash) {
    throw new Error(
      `A variable with this name already exists as "${clash.key}".`,
    );
  }

  const current = existing.find((variable) => variable.key === input.key);

  if (current && current.isSecret !== input.isSecret) {
    throw new Error(
      `"${input.key}" already exists as a ${
        current.isSecret ? "secret" : "non-secret"
      } variable. Delete it first to change how it is stored.`,
    );
  }

  let vaultUri: string | null = input.appRequest.azureKeyVaultUri;

  if (input.isSecret) {
    const vault = await ensureKeyVault(deps, input.appRequest);

    vaultUri = vault.uri;
    await deps
      .createKeyVaultClient(vault.uri)
      .setSecret({ name: toKeyVaultSecretName(input.key), value: input.value });

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
    await applyLiveSetting(
      deps,
      input.appRequest.azureWebAppName,
      (settings) => {
        settings[input.key] = input.isSecret
          ? keyVaultReference(vaultUri as string, input.key)
          : input.value;
      },
    );
  }

  await deps.prisma.appEnvironmentVariable.upsert({
    where: {
      appRequestId_key: {
        appRequestId: input.appRequest.id,
        key: input.key,
      },
    },
    create: {
      appRequestId: input.appRequest.id,
      key: input.key,
      isSecret: input.isSecret,
      value: input.isSecret ? null : input.value,
    },
    update: {
      isSecret: input.isSecret,
      value: input.isSecret ? null : input.value,
    },
  });
}

export async function deleteEnvironmentVariable(
  deps: EnvVarServiceDeps,
  input: { appRequest: EnvVarAppRequest; key: string },
) {
  const existing = await deps.prisma.appEnvironmentVariable.findMany({
    where: { appRequestId: input.appRequest.id },
  });
  const row = existing.find((variable) => variable.key === input.key);

  if (!row) {
    throw new Error(`Variable "${input.key}" was not found.`);
  }

  if (input.appRequest.azureWebAppName) {
    await applyLiveSetting(
      deps,
      input.appRequest.azureWebAppName,
      (settings) => {
        delete settings[input.key];
      },
    );
  }

  if (row.isSecret && input.appRequest.azureKeyVaultUri) {
    await deps
      .createKeyVaultClient(input.appRequest.azureKeyVaultUri)
      .deleteSecret({ name: toKeyVaultSecretName(input.key) });
  }

  await deps.prisma.appEnvironmentVariable.delete({
    where: {
      appRequestId_key: {
        appRequestId: input.appRequest.id,
        key: input.key,
      },
    },
  });
}
