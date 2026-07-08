import { createHash } from "node:crypto";

type FetchLike = typeof fetch;

type AzureArmClientOptions = {
  subscriptionId: string;
  tokenProvider: () => Promise<string>;
  fetchImpl?: FetchLike;
};

type AzureWebAppResponse = {
  properties?: {
    defaultHostName?: string;
  };
  identity?: {
    principalId?: string;
  };
};

export const KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID =
  "4633458b-17de-408a-b874-0445c86b69e6";

function deterministicGuid(input: string) {
  const hash = createHash("sha256").update(input).digest("hex");

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Azure ARM request failed: ${response.status} ${text}`);
  }

  const body = text ? (JSON.parse(text) as T) : null;

  return body as T;
}

async function requireAzureStatus(response: Response, expectedStatuses: number[]) {
  if (expectedStatuses.includes(response.status)) {
    return;
  }

  const text = await response.text();

  throw new Error(`Azure ARM request failed: ${response.status} ${text}`);
}

function toStringSettings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const settings: Record<string, string> = {};

  for (const [key, settingValue] of Object.entries(value)) {
    if (typeof settingValue === "string") {
      settings[key] = settingValue;
    }
  }

  return settings;
}

export function createAzureArmClient({
  subscriptionId,
  tokenProvider,
  fetchImpl = fetch,
}: AzureArmClientOptions) {
  async function headers() {
    return {
      Authorization: `Bearer ${await tokenProvider()}`,
      "Content-Type": "application/json",
    };
  }

  function resourceUrl(path: string, apiVersion: string) {
    return `https://management.azure.com/subscriptions/${subscriptionId}${path}?api-version=${apiVersion}`;
  }

  return {
    appServicePlanId(resourceGroup: string, name: string) {
      return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/serverfarms/${name}`;
    },
    async putWebApp(input: {
      resourceGroup: string;
      name: string;
      location: string;
      appServicePlanId: string;
      runtimeStack: string;
      startupCommand: string;
      tags: Record<string, string>;
    }) {
      return readJson<AzureWebAppResponse>(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.Web/sites/${input.name}`,
            "2023-12-01",
          ),
          {
            method: "PUT",
            headers: await headers(),
            body: JSON.stringify({
              location: input.location,
              kind: "app,linux",
              identity: { type: "SystemAssigned" },
              tags: input.tags,
              properties: {
                serverFarmId: input.appServicePlanId,
                httpsOnly: true,
                siteConfig: {
                  linuxFxVersion: input.runtimeStack,
                  appCommandLine: input.startupCommand,
                },
              },
            }),
          },
        ),
      );
    },
    async putAppSettings(input: {
      resourceGroup: string;
      name: string;
      settings: Record<string, string>;
    }) {
      await readJson<unknown>(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.Web/sites/${input.name}/config/appsettings`,
            "2023-12-01",
          ),
          {
            method: "PUT",
            headers: await headers(),
            body: JSON.stringify({
              properties: input.settings,
            }),
          },
        ),
      );
    },
    async getAppSettings(input: {
      resourceGroup: string;
      name: string;
    }) {
      const response = await fetchImpl(
        resourceUrl(
          `/resourceGroups/${input.resourceGroup}/providers/Microsoft.Web/sites/${input.name}/config/appsettings/list`,
          "2023-12-01",
        ),
        {
          method: "POST",
          headers: await headers(),
        },
      );

      if (response.status === 404) {
        return { exists: false as const, settings: {} };
      }

      const data = await readJson<{ properties?: unknown }>(response);

      return {
        exists: true as const,
        settings: toStringSettings(data.properties),
      };
    },
    async deleteWebApp(input: {
      resourceGroup: string;
      name: string;
    }) {
      await requireAzureStatus(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.Web/sites/${input.name}`,
            "2023-12-01",
          ),
          {
            method: "DELETE",
            headers: await headers(),
          },
        ),
        [200, 202, 204, 404],
      );
    },
    async putPostgresDatabase(input: {
      resourceGroup: string;
      serverName: string;
      databaseName: string;
      tags: Record<string, string>;
    }) {
      await readJson<unknown>(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${input.serverName}/databases/${input.databaseName}`,
            "2023-06-01-preview",
          ),
          {
            method: "PUT",
            headers: await headers(),
            body: JSON.stringify({
              tags: input.tags,
              properties: {
                charset: "UTF8",
                collation: "en_US.utf8",
              },
            }),
          },
        ),
      );
    },
    async deletePostgresDatabase(input: {
      resourceGroup: string;
      serverName: string;
      databaseName: string;
    }) {
      await requireAzureStatus(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${input.serverName}/databases/${input.databaseName}`,
            "2023-06-01-preview",
          ),
          {
            method: "DELETE",
            headers: await headers(),
          },
        ),
        [200, 202, 204, 404],
      );
    },
    keyVaultId(resourceGroup: string, name: string) {
      return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.KeyVault/vaults/${name}`;
    },
    async putKeyVault(input: {
      resourceGroup: string;
      name: string;
      location: string;
      tenantId: string;
      tags: Record<string, string>;
    }) {
      const data = await readJson<{ properties?: { vaultUri?: string } }>(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.KeyVault/vaults/${input.name}`,
            "2023-07-01",
          ),
          {
            method: "PUT",
            headers: await headers(),
            body: JSON.stringify({
              location: input.location,
              tags: input.tags,
              properties: {
                tenantId: input.tenantId,
                sku: { family: "A", name: "standard" },
                enableRbacAuthorization: true,
              },
            }),
          },
        ),
      );
      const vaultUri =
        data.properties?.vaultUri ?? `https://${input.name}.vault.azure.net`;

      return { vaultUri: vaultUri.replace(/\/+$/, "") };
    },
    async deleteKeyVault(input: { resourceGroup: string; name: string }) {
      await requireAzureStatus(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.KeyVault/vaults/${input.name}`,
            "2023-07-01",
          ),
          {
            method: "DELETE",
            headers: await headers(),
          },
        ),
        [200, 202, 204, 404],
      );
    },
    async putRoleAssignment(input: {
      scope: string;
      roleDefinitionId: string;
      principalId: string;
    }) {
      const assignmentName = deterministicGuid(
        `${input.scope}|${input.roleDefinitionId}|${input.principalId}`,
      );
      const response = await fetchImpl(
        `https://management.azure.com${input.scope}/providers/Microsoft.Authorization/roleAssignments/${assignmentName}?api-version=2022-04-01`,
        {
          method: "PUT",
          headers: await headers(),
          body: JSON.stringify({
            properties: {
              roleDefinitionId: `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${input.roleDefinitionId}`,
              principalId: input.principalId,
              principalType: "ServicePrincipal",
            },
          }),
        },
      );

      if (response.status === 409) {
        await response.text();

        return;
      }

      await readJson<unknown>(response);
    },
    async ensureSystemAssignedIdentity(input: {
      resourceGroup: string;
      name: string;
    }) {
      const data = await readJson<AzureWebAppResponse>(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.Web/sites/${input.name}`,
            "2023-12-01",
          ),
          {
            method: "PATCH",
            headers: await headers(),
            body: JSON.stringify({ identity: { type: "SystemAssigned" } }),
          },
        ),
      );

      if (!data.identity?.principalId) {
        throw new Error(
          `Azure web app ${input.name} did not return a managed identity principal.`,
        );
      }

      return { principalId: data.identity.principalId };
    },
  };
}
