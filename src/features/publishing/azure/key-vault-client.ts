type FetchLike = typeof fetch;

type KeyVaultClientOptions = {
  vaultUri: string;
  tokenProvider: () => Promise<string>;
  fetchImpl?: FetchLike;
};

const KEY_VAULT_API_VERSION = "7.4";

export function createKeyVaultClient({
  vaultUri,
  tokenProvider,
  fetchImpl = fetch,
}: KeyVaultClientOptions) {
  const baseUrl = vaultUri.replace(/\/+$/, "");

  async function headers() {
    return {
      Authorization: `Bearer ${await tokenProvider()}`,
      "Content-Type": "application/json",
    };
  }

  async function requireOk(response: Response) {
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Azure Key Vault request failed: ${response.status} ${text}`,
      );
    }
  }

  return {
    async setSecret(input: { name: string; value: string }) {
      await requireOk(
        await fetchImpl(
          `${baseUrl}/secrets/${input.name}?api-version=${KEY_VAULT_API_VERSION}`,
          {
            method: "PUT",
            headers: await headers(),
            body: JSON.stringify({ value: input.value }),
          },
        ),
      );
    },
    async deleteSecret(input: { name: string }) {
      const response = await fetchImpl(
        `${baseUrl}/secrets/${input.name}?api-version=${KEY_VAULT_API_VERSION}`,
        {
          method: "DELETE",
          headers: await headers(),
        },
      );

      if (response.status === 404) {
        await response.text();

        return;
      }

      await requireOk(response);
    },
  };
}
