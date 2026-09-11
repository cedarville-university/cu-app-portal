import { describe, expect, it, vi } from "vitest";

import {
  WEBSITE_CONTRIBUTOR_ROLE_DEFINITION_ID,
  createAzureArmClient,
} from "./arm-client";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function text(body: string, init: ResponseInit) {
  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
    ...init,
  });
}

describe("createAzureArmClient", () => {
  it("creates or updates a web app with app settings and startup command", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(json({ id: "resource-id", properties: {} }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.putWebApp({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
      location: "eastus2",
      appServicePlanId:
        "/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/serverfarms/asp-cu-apps-published",
      runtimeStack: "NODE|24-lts",
      startupCommand: "npm start",
      tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(
        "/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1",
      ),
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("api-version=2023-12-01"),
      expect.objectContaining({
        body: JSON.stringify({
          location: "eastus2",
          kind: "app,linux",
          identity: { type: "SystemAssigned" },
          tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
          properties: {
            serverFarmId:
              "/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/serverfarms/asp-cu-apps-published",
            httpsOnly: true,
            siteConfig: {
              linuxFxVersion: "NODE|24-lts",
              appCommandLine: "npm start",
            },
          },
        }),
      }),
    );
  });

  it("creates or updates a PostgreSQL database on the shared server", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(json({ id: "database-id" }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.putPostgresDatabase({
      resourceGroup: "rg-cu-apps-published",
      serverName: "psql-cu-apps-published",
      databaseName: "db_campus_dashboard_clx9abc1",
      tags: {
        managedBy: "cu-app-portal",
        appRequestId: "request-123",
        ownerUsername: "portalstaff",
      },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.DBforPostgreSQL/flexibleServers/psql-cu-apps-published/databases/db_campus_dashboard_clx9abc1?api-version=2023-06-01-preview",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          tags: {
            managedBy: "cu-app-portal",
            appRequestId: "request-123",
            ownerUsername: "portalstaff",
          },
          properties: { charset: "UTF8", collation: "en_US.utf8" },
        }),
      }),
    );
  });

  it("creates or updates web app settings", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(json({ properties: {} }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.putAppSettings({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
      settings: {
        DATABASE_URL: "postgresql://example",
        NODE_ENV: "production",
      },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1/config/appsettings?api-version=2023-12-01",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          properties: {
            DATABASE_URL: "postgresql://example",
            NODE_ENV: "production",
          },
        }),
      }),
    );
  });

  it("reads existing web app settings without exposing a missing app as an exception", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json({
          properties: {
            EXISTING_CUSTOM_SETTING: "keep-me",
            NODE_ENV: "production",
          },
        }),
      )
      .mockResolvedValueOnce(text("not found", { status: 404 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.getAppSettings({
        resourceGroup: "rg-cu-apps-published",
        name: "app-campus-dashboard-clx9abc1",
      }),
    ).resolves.toEqual({
      exists: true,
      settings: {
        EXISTING_CUSTOM_SETTING: "keep-me",
        NODE_ENV: "production",
      },
    });
    await expect(
      client.getAppSettings({
        resourceGroup: "rg-cu-apps-published",
        name: "missing-app",
      }),
    ).resolves.toEqual({ exists: false, settings: {} });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1/config/appsettings/list?api-version=2023-12-01",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws the ARM response status and text when app settings cannot be read", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(text("forbidden", { status: 403 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.getAppSettings({
        resourceGroup: "rg-cu-apps-published",
        name: "app-campus-dashboard-clx9abc1",
      }),
    ).rejects.toThrow("Azure ARM request failed: 403 forbidden");
  });

  it("deletes the app web app and only the selected PostgreSQL database", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.deleteWebApp({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
    });
    await client.deletePostgresDatabase({
      resourceGroup: "rg-cu-apps-published",
      serverName: "psql-cu-apps-published",
      databaseName: "db_campus_dashboard_clx9abc1",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1?api-version=2023-12-01",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.DBforPostgreSQL/flexibleServers/psql-cu-apps-published/databases/db_campus_dashboard_clx9abc1?api-version=2023-06-01-preview",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchImpl).not.toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.DBforPostgreSQL/flexibleServers/psql-cu-apps-published?api-version=2023-06-01-preview",
      expect.anything(),
    );
  });

  it("throws the ARM response status and text for non-JSON error bodies", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(text("plain ARM failure", { status: 400 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.putWebApp({
        resourceGroup: "rg-cu-apps-published",
        name: "app-campus-dashboard-clx9abc1",
        location: "eastus2",
        appServicePlanId:
          "/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/serverfarms/asp-cu-apps-published",
        runtimeStack: "NODE|24-lts",
        startupCommand: "npm start",
        tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
      }),
    ).rejects.toThrow("Azure ARM request failed: 400 plain ARM failure");
  });

  it("creates an rbac key vault and returns its uri", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(
        json({
          properties: { vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net/" },
        }),
      );
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    const result = await client.putKeyVault({
      resourceGroup: "rg-cu-apps-published",
      name: "kv-campus-dashb-clx9abc1",
      location: "eastus2",
      tenantId: "tenant-id",
      tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
    });

    expect(result).toEqual({
      vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.KeyVault/vaults/kv-campus-dashb-clx9abc1?api-version=2023-07-01",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          location: "eastus2",
          tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
          properties: {
            tenantId: "tenant-id",
            sku: { family: "A", name: "standard" },
            enableRbacAuthorization: true,
          },
        }),
      }),
    );
  });

  it("retries with createMode recover when the vault name is soft-deleted", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(text("VaultAlreadyExists", { status: 409 }))
      .mockResolvedValueOnce(
        json({
          properties: { vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net/" },
        }),
      );
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    const result = await client.putKeyVault({
      resourceGroup: "rg-cu-apps-published",
      name: "kv-campus-dashb-clx9abc1",
      location: "eastus2",
      tenantId: "tenant-id",
      tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.KeyVault/vaults/kv-campus-dashb-clx9abc1?api-version=2023-07-01",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          location: "eastus2",
          tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
          properties: {
            tenantId: "tenant-id",
            sku: { family: "A", name: "standard" },
            enableRbacAuthorization: true,
            createMode: "recover",
          },
        }),
      }),
    );
  });

  it("deletes a key vault and tolerates a missing vault", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(text("not found", { status: 404 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.deleteKeyVault({
      resourceGroup: "rg-cu-apps-published",
      name: "kv-campus-dashb-clx9abc1",
    });
    await client.deleteKeyVault({
      resourceGroup: "rg-cu-apps-published",
      name: "kv-missing",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.KeyVault/vaults/kv-campus-dashb-clx9abc1?api-version=2023-07-01",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("creates a role assignment with a deterministic name and treats conflicts as success", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(json({ id: "assignment-id" }))
      .mockResolvedValueOnce(text("RoleAssignmentExists", { status: 409 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });
    const scope = client.keyVaultId(
      "rg-cu-apps-published",
      "kv-campus-dashb-clx9abc1",
    );

    await client.putRoleAssignment({
      scope,
      roleDefinitionId: "4633458b-17de-408a-b874-0445c86b69e6",
      principalId: "principal-guid",
    });
    await client.putRoleAssignment({
      scope,
      roleDefinitionId: "4633458b-17de-408a-b874-0445c86b69e6",
      principalId: "principal-guid",
    });

    const firstUrl = fetchImpl.mock.calls[0][0] as string;
    const secondUrl = fetchImpl.mock.calls[1][0] as string;

    expect(firstUrl).toBe(secondUrl);
    expect(firstUrl).toContain(
      `https://management.azure.com${scope}/providers/Microsoft.Authorization/roleAssignments/`,
    );
    expect(firstUrl).toContain("api-version=2022-04-01");
    expect(firstUrl).toMatch(
      /roleAssignments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\?/,
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      firstUrl,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          properties: {
            roleDefinitionId:
              "/subscriptions/sub/providers/Microsoft.Authorization/roleDefinitions/4633458b-17de-408a-b874-0445c86b69e6",
            principalId: "principal-guid",
            principalType: "ServicePrincipal",
          },
        }),
      }),
    );
  });

  it("ensures a system-assigned identity and returns the principal id", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(json({ identity: { principalId: "principal-guid" } }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.ensureSystemAssignedIdentity({
        resourceGroup: "rg-cu-apps-published",
        name: "app-campus-dashboard-clx9abc1",
      }),
    ).resolves.toEqual({ principalId: "principal-guid" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1?api-version=2023-12-01",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ identity: { type: "SystemAssigned" } }),
      }),
    );
  });

  it("retries a role assignment when the principal has not replicated yet", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json(
          {
            error: {
              code: "PrincipalNotFound",
              message: "Principal abc does not exist in the directory.",
            },
          },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(json({ id: "assignment-id" }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
      sleepImpl,
    });

    await client.putRoleAssignment({
      scope: client.webAppId("rg-cu-apps-published", "app-campus-dashboard-clx9abc1"),
      roleDefinitionId: WEBSITE_CONTRIBUTOR_ROLE_DEFINITION_ID,
      principalId: "principal-guid",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(WEBSITE_CONTRIBUTOR_ROLE_DEFINITION_ID).toBe(
      "de139f84-1756-47ae-9be6-808fbbe84772",
    );
  });

  it("builds a web app resource id", () => {
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
    });

    expect(
      client.webAppId("rg-cu-apps-published", "app-campus-dashboard-clx9abc1"),
    ).toBe(
      "/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1",
    );
  });

  it("creates a user-assigned identity and returns its client and principal ids", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(
        json(
          {
            id: "identity-id",
            properties: {
              clientId: "client-guid",
              principalId: "principal-guid",
              tenantId: "tenant-guid",
            },
          },
          { status: 201 },
        ),
      );
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.putUserAssignedIdentity({
        resourceGroup: "rg-cu-apps-published",
        name: "id-campus-dashboard-clx9abc1",
        location: "eastus2",
        tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
      }),
    ).resolves.toEqual({
      clientId: "client-guid",
      principalId: "principal-guid",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-campus-dashboard-clx9abc1?api-version=2023-01-31",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          location: "eastus2",
          tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
        }),
      }),
    );
  });

  it("reads a user-assigned identity and reports when it is missing", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json({
          properties: { clientId: "client-guid", principalId: "principal-guid" },
        }),
      )
      .mockResolvedValueOnce(text("ResourceNotFound", { status: 404 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });
    const input = {
      resourceGroup: "rg-cu-apps-published",
      name: "id-campus-dashboard-clx9abc1",
    };

    await expect(client.getUserAssignedIdentity(input)).resolves.toEqual({
      exists: true,
      clientId: "client-guid",
      principalId: "principal-guid",
    });
    await expect(client.getUserAssignedIdentity(input)).resolves.toEqual({
      exists: false,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-campus-dashboard-clx9abc1?api-version=2023-01-31",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("deletes a user-assigned identity and tolerates a missing identity", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(text("", { status: 200 }))
      .mockResolvedValueOnce(text("ResourceNotFound", { status: 404 }));
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });
    const input = {
      resourceGroup: "rg-cu-apps-published",
      name: "id-campus-dashboard-clx9abc1",
    };

    await expect(client.deleteUserAssignedIdentity(input)).resolves.toBeUndefined();
    await expect(client.deleteUserAssignedIdentity(input)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-campus-dashboard-clx9abc1?api-version=2023-01-31",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("lists federated identity credentials on a user-assigned identity", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(
        json({
          value: [
            {
              name: "github-campus-dashboard-clx9abc1",
              properties: {
                issuer: "https://token.actions.githubusercontent.com",
                subject: "repo:cedarville/campus-dashboard:ref:refs/heads/main",
                audiences: ["api://AzureADTokenExchange"],
              },
            },
          ],
        }),
      );
    const client = createAzureArmClient({
      subscriptionId: "sub",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.listFederatedIdentityCredentials({
        resourceGroup: "rg-cu-apps-published",
        identityName: "id-campus-dashboard-clx9abc1",
      }),
    ).resolves.toEqual([
      {
        name: "github-campus-dashboard-clx9abc1",
        issuer: "https://token.actions.githubusercontent.com",
        subject: "repo:cedarville/campus-dashboard:ref:refs/heads/main",
        audiences: ["api://AzureADTokenExchange"],
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-campus-dashboard-clx9abc1/federatedIdentityCredentials?api-version=2023-01-31",
      expect.objectContaining({ method: "GET" }),
    );
  });

  describe("ensureFederatedIdentityCredential", () => {
    const identity = {
      resourceGroup: "rg-cu-apps-published",
      identityName: "id-campus-dashboard-clx9abc1",
    };
    const credentialsUrl =
      "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-campus-dashboard-clx9abc1/federatedIdentityCredentials";
    const expectedSubject =
      "repo:cedarville/campus-dashboard:ref:refs/heads/main";

    function credential(name: string, subject: string) {
      return {
        name,
        properties: {
          issuer: "https://token.actions.githubusercontent.com",
          subject,
          audiences: ["api://AzureADTokenExchange"],
        },
      };
    }

    it("leaves a matching credential untouched", async () => {
      const fetchImpl = vi
        .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
        .mockResolvedValueOnce(
          json({
            value: [credential("github-campus-dashboard-clx9abc1", expectedSubject)],
          }),
        );
      const client = createAzureArmClient({
        subscriptionId: "sub",
        tokenProvider: async () => "token",
        fetchImpl,
      });

      await client.ensureFederatedIdentityCredential({
        ...identity,
        name: "github-campus-dashboard-clx9abc1",
        subject: expectedSubject,
      });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("replaces a same-named credential whose subject changed", async () => {
      const fetchImpl = vi
        .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
        .mockResolvedValueOnce(
          json({
            value: [
              credential(
                "github-campus-dashboard-clx9abc1",
                "repo:cedarville/old-name:ref:refs/heads/main",
              ),
            ],
          }),
        )
        .mockResolvedValueOnce(json({ name: "github-campus-dashboard-clx9abc1" }));
      const client = createAzureArmClient({
        subscriptionId: "sub",
        tokenProvider: async () => "token",
        fetchImpl,
      });

      await client.ensureFederatedIdentityCredential({
        ...identity,
        name: "github-campus-dashboard-clx9abc1",
        subject: expectedSubject,
      });

      expect(fetchImpl).toHaveBeenNthCalledWith(
        2,
        `${credentialsUrl}/github-campus-dashboard-clx9abc1?api-version=2023-01-31`,
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            properties: {
              issuer: "https://token.actions.githubusercontent.com",
              subject: expectedSubject,
              audiences: ["api://AzureADTokenExchange"],
            },
          }),
        }),
      );
    });

    it("deletes credentials the portal did not name before creating its own", async () => {
      const fetchImpl = vi
        .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
        .mockResolvedValueOnce(
          json({ value: [credential("someone-else", expectedSubject)] }),
        )
        .mockResolvedValueOnce(text("", { status: 200 }))
        .mockResolvedValueOnce(json({ name: "github-campus-dashboard-clx9abc1" }));
      const client = createAzureArmClient({
        subscriptionId: "sub",
        tokenProvider: async () => "token",
        fetchImpl,
      });

      await client.ensureFederatedIdentityCredential({
        ...identity,
        name: "github-campus-dashboard-clx9abc1",
        subject: expectedSubject,
      });

      expect(fetchImpl).toHaveBeenNthCalledWith(
        2,
        `${credentialsUrl}/someone-else?api-version=2023-01-31`,
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(fetchImpl).toHaveBeenNthCalledWith(
        3,
        `${credentialsUrl}/github-campus-dashboard-clx9abc1?api-version=2023-01-31`,
        expect.objectContaining({ method: "PUT" }),
      );
    });

    it("retries after a concurrent-write conflict", async () => {
      const fetchImpl = vi
        .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
        .mockResolvedValueOnce(json({ value: [] }))
        .mockResolvedValueOnce(text("Conflict", { status: 409 }))
        .mockResolvedValueOnce(json({ name: "github-campus-dashboard-clx9abc1" }));
      const sleepImpl = vi.fn().mockResolvedValue(undefined);
      const client = createAzureArmClient({
        subscriptionId: "sub",
        tokenProvider: async () => "token",
        fetchImpl,
        sleepImpl,
      });

      await client.ensureFederatedIdentityCredential({
        ...identity,
        name: "github-campus-dashboard-clx9abc1",
        subject: expectedSubject,
      });

      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(sleepImpl).toHaveBeenCalledTimes(1);
    });
  });
});
