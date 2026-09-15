import { createHash } from "node:crypto";

type FetchLike = typeof fetch;

type AzureArmClientOptions = {
  subscriptionId: string;
  tokenProvider: () => Promise<string>;
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
};

type AzureWebAppResponse = {
  properties?: {
    defaultHostName?: string;
  };
  identity?: {
    principalId?: string;
  };
};

type AzureUserAssignedIdentityResponse = {
  properties?: {
    clientId?: string;
    principalId?: string;
  };
};

type AzureFederatedIdentityCredentialResponse = {
  name: string;
  properties?: {
    issuer?: string;
    subject?: string;
    audiences?: string[];
  };
};

export type FederatedIdentityCredentialSummary = {
  name: string;
  issuer: string;
  subject: string;
  audiences: string[];
};

export const KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID =
  "4633458b-17de-408a-b874-0445c86b69e6";
export const WEBSITE_CONTRIBUTOR_ROLE_DEFINITION_ID =
  "de139f84-1756-47ae-9be6-808fbbe84772";

const MANAGED_IDENTITY_API_VERSION = "2023-01-31";
const GITHUB_ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";
const AZURE_TOKEN_EXCHANGE_AUDIENCE = "api://AzureADTokenExchange";
const ROLE_ASSIGNMENT_PRINCIPAL_RETRY_DELAYS_MS = [2000, 4000, 8000];
const FEDERATED_CREDENTIAL_CONFLICT_RETRY_DELAYS_MS = [500, 1000, 2000];

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

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
  sleepImpl = defaultSleep,
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

  function userAssignedIdentityPath(resourceGroup: string, name: string) {
    return `/resourceGroups/${resourceGroup}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${name}`;
  }

  function federatedCredentialsPath(resourceGroup: string, identityName: string) {
    return `${userAssignedIdentityPath(resourceGroup, identityName)}/federatedIdentityCredentials`;
  }

  async function listFederatedIdentityCredentials(input: {
    resourceGroup: string;
    identityName: string;
  }): Promise<FederatedIdentityCredentialSummary[]> {
    const data = await readJson<{
      value?: AzureFederatedIdentityCredentialResponse[];
    }>(
      await fetchImpl(
        resourceUrl(
          federatedCredentialsPath(input.resourceGroup, input.identityName),
          MANAGED_IDENTITY_API_VERSION,
        ),
        { method: "GET", headers: await headers() },
      ),
    );

    return (data.value ?? []).map((credential) => ({
      name: credential.name,
      issuer: credential.properties?.issuer ?? "",
      subject: credential.properties?.subject ?? "",
      audiences: credential.properties?.audiences ?? [],
    }));
  }

  async function deleteFederatedIdentityCredential(input: {
    resourceGroup: string;
    identityName: string;
    name: string;
  }) {
    await requireAzureStatus(
      await fetchImpl(
        resourceUrl(
          `${federatedCredentialsPath(input.resourceGroup, input.identityName)}/${input.name}`,
          MANAGED_IDENTITY_API_VERSION,
        ),
        { method: "DELETE", headers: await headers() },
      ),
      [200, 202, 204, 404],
    );
  }

  async function putFederatedIdentityCredential(input: {
    resourceGroup: string;
    identityName: string;
    name: string;
    subject: string;
  }) {
    const url = resourceUrl(
      `${federatedCredentialsPath(input.resourceGroup, input.identityName)}/${input.name}`,
      MANAGED_IDENTITY_API_VERSION,
    );
    const body = JSON.stringify({
      properties: {
        issuer: GITHUB_ACTIONS_ISSUER,
        subject: input.subject,
        audiences: [AZURE_TOKEN_EXCHANGE_AUDIENCE],
      },
    });

    for (
      let attempt = 0;
      attempt <= FEDERATED_CREDENTIAL_CONFLICT_RETRY_DELAYS_MS.length;
      attempt += 1
    ) {
      const response = await fetchImpl(url, {
        method: "PUT",
        headers: await headers(),
        body,
      });

      if (
        response.status !== 409 ||
        attempt === FEDERATED_CREDENTIAL_CONFLICT_RETRY_DELAYS_MS.length
      ) {
        await readJson<unknown>(response);
        return;
      }

      await response.text();
      await sleepImpl(FEDERATED_CREDENTIAL_CONFLICT_RETRY_DELAYS_MS[attempt]);
    }
  }

  function isPrincipalNotFound(status: number, text: string) {
    return status === 400 && text.includes("PrincipalNotFound");
  }

  return {
    appServicePlanId(resourceGroup: string, name: string) {
      return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/serverfarms/${name}`;
    },
    webAppId(resourceGroup: string, name: string) {
      return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${name}`;
    },
    userAssignedIdentityId(resourceGroup: string, name: string) {
      return `/subscriptions/${subscriptionId}${userAssignedIdentityPath(resourceGroup, name)}`;
    },
    async putUserAssignedIdentity(input: {
      resourceGroup: string;
      name: string;
      location: string;
      tags: Record<string, string>;
    }) {
      const data = await readJson<AzureUserAssignedIdentityResponse>(
        await fetchImpl(
          resourceUrl(
            userAssignedIdentityPath(input.resourceGroup, input.name),
            MANAGED_IDENTITY_API_VERSION,
          ),
          {
            method: "PUT",
            headers: await headers(),
            body: JSON.stringify({
              location: input.location,
              tags: input.tags,
            }),
          },
        ),
      );

      if (!data.properties?.clientId || !data.properties.principalId) {
        throw new Error(
          `Azure managed identity ${input.name} did not return a client and principal id.`,
        );
      }

      return {
        clientId: data.properties.clientId,
        principalId: data.properties.principalId,
      };
    },
    async getUserAssignedIdentity(input: {
      resourceGroup: string;
      name: string;
    }): Promise<
      | { exists: false }
      | { exists: true; clientId: string; principalId: string }
    > {
      const response = await fetchImpl(
        resourceUrl(
          userAssignedIdentityPath(input.resourceGroup, input.name),
          MANAGED_IDENTITY_API_VERSION,
        ),
        { method: "GET", headers: await headers() },
      );

      if (response.status === 404) {
        await response.text();
        return { exists: false };
      }

      const data = await readJson<AzureUserAssignedIdentityResponse>(response);

      if (!data.properties?.clientId || !data.properties.principalId) {
        throw new Error(
          `Azure managed identity ${input.name} did not return a client and principal id.`,
        );
      }

      return {
        exists: true,
        clientId: data.properties.clientId,
        principalId: data.properties.principalId,
      };
    },
    async deleteUserAssignedIdentity(input: {
      resourceGroup: string;
      name: string;
    }) {
      await requireAzureStatus(
        await fetchImpl(
          resourceUrl(
            userAssignedIdentityPath(input.resourceGroup, input.name),
            MANAGED_IDENTITY_API_VERSION,
          ),
          { method: "DELETE", headers: await headers() },
        ),
        [200, 202, 204, 404],
      );
    },
    listFederatedIdentityCredentials,
    async ensureFederatedIdentityCredential(input: {
      resourceGroup: string;
      identityName: string;
      name: string;
      subject: string;
    }) {
      const credentials = await listFederatedIdentityCredentials(input);
      let matching = false;

      for (const credential of credentials) {
        if (credential.name !== input.name) {
          // The identity is portal-owned, so any credential the portal did
          // not name is stale or foreign. Remove it before writing ours.
          await deleteFederatedIdentityCredential({
            resourceGroup: input.resourceGroup,
            identityName: input.identityName,
            name: credential.name,
          });
          continue;
        }

        matching =
          credential.issuer === GITHUB_ACTIONS_ISSUER &&
          credential.subject === input.subject &&
          credential.audiences.length === 1 &&
          credential.audiences[0] === AZURE_TOKEN_EXCHANGE_AUDIENCE;
      }

      if (matching) {
        return;
      }

      await putFederatedIdentityCredential(input);
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
      const vaultUrl = resourceUrl(
        `/resourceGroups/${input.resourceGroup}/providers/Microsoft.KeyVault/vaults/${input.name}`,
        "2023-07-01",
      );
      const basePutProperties = {
        tenantId: input.tenantId,
        sku: { family: "A", name: "standard" },
        enableRbacAuthorization: true,
      };

      let response = await fetchImpl(vaultUrl, {
        method: "PUT",
        headers: await headers(),
        body: JSON.stringify({
          location: input.location,
          tags: input.tags,
          properties: basePutProperties,
        }),
      });

      if (response.status === 409) {
        await response.text();

        // The deterministic vault name guarantees a soft-deleted vault with
        // this name belonged to this same app, so recovering it is safe.
        response = await fetchImpl(vaultUrl, {
          method: "PUT",
          headers: await headers(),
          body: JSON.stringify({
            location: input.location,
            tags: input.tags,
            properties: { ...basePutProperties, createMode: "recover" },
          }),
        });
      }

      const data = await readJson<{ properties?: { vaultUri?: string } }>(
        response,
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
      const url = `https://management.azure.com${input.scope}/providers/Microsoft.Authorization/roleAssignments/${assignmentName}?api-version=2022-04-01`;
      const body = JSON.stringify({
        properties: {
          roleDefinitionId: `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${input.roleDefinitionId}`,
          principalId: input.principalId,
          principalType: "ServicePrincipal",
        },
      });

      for (
        let attempt = 0;
        attempt <= ROLE_ASSIGNMENT_PRINCIPAL_RETRY_DELAYS_MS.length;
        attempt += 1
      ) {
        const response = await fetchImpl(url, {
          method: "PUT",
          headers: await headers(),
          body,
        });

        if (response.status === 409) {
          await response.text();

          return;
        }

        if (response.ok) {
          await response.text();

          return;
        }

        const text = await response.text();

        // A brand-new managed identity principal can take a moment to
        // replicate to the directory; retry rather than fail provisioning.
        if (
          isPrincipalNotFound(response.status, text) &&
          attempt < ROLE_ASSIGNMENT_PRINCIPAL_RETRY_DELAYS_MS.length
        ) {
          await sleepImpl(ROLE_ASSIGNMENT_PRINCIPAL_RETRY_DELAYS_MS[attempt]);
          continue;
        }

        throw new Error(`Azure ARM request failed: ${response.status} ${text}`);
      }
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
