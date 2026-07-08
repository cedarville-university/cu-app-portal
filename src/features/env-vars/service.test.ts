import { describe, expect, it, vi } from "vitest";

import {
  deleteEnvironmentVariable,
  saveEnvironmentVariable,
  type EnvVarAppRequest,
} from "./service";

const unpublishedAppRequest: EnvVarAppRequest = {
  id: "clx9abc123zzzzzzzzzz",
  appName: "Campus Dashboard",
  azureWebAppName: null,
  azureKeyVaultName: null,
  azureKeyVaultUri: null,
};

const publishedAppRequest: EnvVarAppRequest = {
  ...unpublishedAppRequest,
  azureWebAppName: "app-campus-dashboard-clx9abc1",
};

const publishedWithVault: EnvVarAppRequest = {
  ...publishedAppRequest,
  azureKeyVaultName: "kv-campus-dashb-clx9abc1",
  azureKeyVaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
};

function createDeps({
  existingVariables = [] as Array<{
    key: string;
    isSecret: boolean;
    value: string | null;
  }>,
} = {}) {
  const keyVault = {
    setSecret: vi.fn().mockResolvedValue(undefined),
    deleteSecret: vi.fn().mockResolvedValue(undefined),
  };
  const arm = {
    keyVaultId: vi.fn(
      (resourceGroup: string, name: string) =>
        `/subscriptions/sub/resourceGroups/${resourceGroup}/providers/Microsoft.KeyVault/vaults/${name}`,
    ),
    putKeyVault: vi.fn().mockResolvedValue({
      vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
    }),
    getAppSettings: vi.fn().mockResolvedValue({
      exists: true,
      settings: { NODE_ENV: "production", KEEP_ME: "yes" },
    }),
    putAppSettings: vi.fn().mockResolvedValue(undefined),
    putRoleAssignment: vi.fn().mockResolvedValue(undefined),
    ensureSystemAssignedIdentity: vi
      .fn()
      .mockResolvedValue({ principalId: "webapp-principal" }),
  };
  const prisma = {
    appRequest: {
      update: vi.fn().mockResolvedValue({}),
    },
    appEnvironmentVariable: {
      findMany: vi.fn().mockResolvedValue(existingVariables),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  };

  return {
    deps: {
      prisma: prisma as never,
      config: {
        resourceGroup: "rg-cu-apps-published",
        location: "eastus2",
        azureTenantId: "tenant-id",
      },
      arm,
      createKeyVaultClient: vi.fn().mockReturnValue(keyVault),
    },
    prisma,
    arm,
    keyVault,
  };
}

describe("saveEnvironmentVariable", () => {
  it("stores a non-secret for an unpublished app without touching azure", async () => {
    const { deps, prisma, arm } = createDeps();

    await saveEnvironmentVariable(deps, {
      appRequest: unpublishedAppRequest,
      key: "FEATURE_FLAG",
      value: "on",
      isSecret: false,
    });

    expect(arm.putKeyVault).not.toHaveBeenCalled();
    expect(arm.putAppSettings).not.toHaveBeenCalled();
    expect(prisma.appEnvironmentVariable.upsert).toHaveBeenCalledWith({
      where: {
        appRequestId_key: {
          appRequestId: "clx9abc123zzzzzzzzzz",
          key: "FEATURE_FLAG",
        },
      },
      create: {
        appRequestId: "clx9abc123zzzzzzzzzz",
        key: "FEATURE_FLAG",
        isSecret: false,
        value: "on",
      },
      update: { isSecret: false, value: "on" },
    });
  });

  it("rejects reserved keys", async () => {
    const { deps, prisma } = createDeps();

    await expect(
      saveEnvironmentVariable(deps, {
        appRequest: unpublishedAppRequest,
        key: "DATABASE_URL",
        value: "x",
        isSecret: false,
      }),
    ).rejects.toThrow("reserved");
    expect(prisma.appEnvironmentVariable.upsert).not.toHaveBeenCalled();
  });

  it("rejects a key that clashes case-insensitively with an existing variable", async () => {
    const { deps } = createDeps({
      existingVariables: [{ key: "API_KEY", isSecret: false, value: "x" }],
    });

    await expect(
      saveEnvironmentVariable(deps, {
        appRequest: unpublishedAppRequest,
        key: "api_key",
        value: "y",
        isSecret: false,
      }),
    ).rejects.toThrow('already exists as "API_KEY"');
  });

  it("rejects changing a variable between secret and non-secret", async () => {
    const { deps } = createDeps({
      existingVariables: [{ key: "API_KEY", isSecret: true, value: null }],
    });

    await expect(
      saveEnvironmentVariable(deps, {
        appRequest: unpublishedAppRequest,
        key: "API_KEY",
        value: "y",
        isSecret: false,
      }),
    ).rejects.toThrow("Delete it first");
  });

  it("creates the vault lazily, stores the secret, and records vault fields", async () => {
    const { deps, prisma, keyVault } = createDeps();

    await saveEnvironmentVariable(deps, {
      appRequest: unpublishedAppRequest,
      key: "API_KEY",
      value: "s3cret",
      isSecret: true,
    });

    expect(deps.arm.putKeyVault).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      name: "kv-campus-dashb-clx9abc1",
      location: "eastus2",
      tenantId: "tenant-id",
      tags: {
        managedBy: "cu-app-portal",
        appRequestId: "clx9abc123zzzzzzzzzz",
      },
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "clx9abc123zzzzzzzzzz" },
      data: {
        azureKeyVaultName: "kv-campus-dashb-clx9abc1",
        azureKeyVaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
      },
    });
    expect(keyVault.setSecret).toHaveBeenCalledWith({
      name: "API-KEY",
      value: "s3cret",
    });
    expect(prisma.appEnvironmentVariable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isSecret: true, value: null }),
      }),
    );
  });

  it("merges into live app settings and grants vault access for a published app", async () => {
    const { deps, arm } = createDeps();

    await saveEnvironmentVariable(deps, {
      appRequest: publishedAppRequest,
      key: "API_KEY",
      value: "s3cret",
      isSecret: true,
    });

    expect(arm.ensureSystemAssignedIdentity).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
    });
    expect(arm.putRoleAssignment).toHaveBeenCalledWith({
      scope:
        "/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.KeyVault/vaults/kv-campus-dashb-clx9abc1",
      roleDefinitionId: "4633458b-17de-408a-b874-0445c86b69e6",
      principalId: "webapp-principal",
    });
    expect(arm.putAppSettings).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
      settings: {
        NODE_ENV: "production",
        KEEP_ME: "yes",
        API_KEY:
          "@Microsoft.KeyVault(SecretUri=https://kv-campus-dashb-clx9abc1.vault.azure.net/secrets/API-KEY)",
      },
    });
  });

  it("does not persist the row when azure fails", async () => {
    const { deps, prisma, arm } = createDeps();
    arm.putAppSettings.mockRejectedValue(new Error("Azure ARM request failed: 403"));

    await expect(
      saveEnvironmentVariable(deps, {
        appRequest: publishedAppRequest,
        key: "FEATURE_FLAG",
        value: "on",
        isSecret: false,
      }),
    ).rejects.toThrow("403");
    expect(prisma.appEnvironmentVariable.upsert).not.toHaveBeenCalled();
  });

  it("does not persist the row when app does not exist", async () => {
    const { deps, prisma, arm } = createDeps();
    arm.getAppSettings.mockResolvedValue({ exists: false, settings: {} });

    await expect(
      saveEnvironmentVariable(deps, {
        appRequest: publishedAppRequest,
        key: "FEATURE_FLAG",
        value: "on",
        isSecret: false,
      }),
    ).rejects.toThrow(/could not be found/);
    expect(prisma.appEnvironmentVariable.upsert).not.toHaveBeenCalled();
  });
});

describe("deleteEnvironmentVariable", () => {
  it("removes the app setting, vault secret, and row", async () => {
    const { deps, prisma, arm, keyVault } = createDeps({
      existingVariables: [{ key: "API_KEY", isSecret: true, value: null }],
    });

    await deleteEnvironmentVariable(deps, {
      appRequest: publishedWithVault,
      key: "API_KEY",
    });

    expect(arm.putAppSettings).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
      settings: { NODE_ENV: "production", KEEP_ME: "yes" },
    });
    expect(keyVault.deleteSecret).toHaveBeenCalledWith({ name: "API-KEY" });
    expect(prisma.appEnvironmentVariable.delete).toHaveBeenCalledWith({
      where: {
        appRequestId_key: {
          appRequestId: "clx9abc123zzzzzzzzzz",
          key: "API_KEY",
        },
      },
    });
  });

  it("throws when the variable does not exist", async () => {
    const { deps } = createDeps();

    await expect(
      deleteEnvironmentVariable(deps, {
        appRequest: publishedWithVault,
        key: "MISSING",
      }),
    ).rejects.toThrow("was not found");
  });

  it("does not persist deletion when azure fails (azure-first ordering)", async () => {
    const { deps, prisma, arm, keyVault } = createDeps({
      existingVariables: [{ key: "API_KEY", isSecret: true, value: null }],
    });
    arm.putAppSettings.mockRejectedValue(new Error("Azure ARM request failed: 503"));

    await expect(
      deleteEnvironmentVariable(deps, {
        appRequest: publishedWithVault,
        key: "API_KEY",
      }),
    ).rejects.toThrow(/503/);
    expect(prisma.appEnvironmentVariable.delete).not.toHaveBeenCalled();
    expect(keyVault.deleteSecret).not.toHaveBeenCalled();
  });
});
