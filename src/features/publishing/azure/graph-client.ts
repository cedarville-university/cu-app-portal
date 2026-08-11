type FetchLike = typeof fetch;

type MicrosoftGraphClientOptions = {
  tokenProvider: () => Promise<string>;
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
};

const FEDERATED_CREDENTIAL_RETRY_DELAYS_MS = [250, 500, 1000];

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Microsoft Graph request failed: ${response.status} ${text}`);
  }

  const body = text ? (JSON.parse(text) as T) : null;

  return body as T;
}

export function createMicrosoftGraphClient({
  tokenProvider,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
}: MicrosoftGraphClientOptions) {
  async function headers() {
    return {
      Authorization: `Bearer ${await tokenProvider()}`,
      "Content-Type": "application/json",
    };
  }

  function federatedCredentialsUrl(applicationAppId: string) {
    return `https://graph.microsoft.com/v1.0/applications(appId='${applicationAppId}')/federatedIdentityCredentials`;
  }

  function federatedCredentialUrl(
    applicationAppId: string,
    credentialId: string,
  ) {
    return `${federatedCredentialsUrl(applicationAppId)}/${credentialId}`;
  }

  function federatedCredentialPayload({
    name,
    subject,
  }: {
    name: string;
    subject: string;
  }) {
    return {
      name,
      issuer: "https://token.actions.githubusercontent.com",
      subject,
      audiences: ["api://AzureADTokenExchange"],
    };
  }

  async function listFederatedCredentials({
    applicationAppId,
  }: {
    applicationAppId: string;
  }) {
    const data = await readJson<{
      value?: Array<{ id: string; name: string; subject?: string }>;
    }>(
      await fetchImpl(federatedCredentialsUrl(applicationAppId), {
        method: "GET",
        headers: await headers(),
      }),
    );

    return data.value ?? [];
  }

  async function deleteFederatedCredential({
    applicationAppId,
    credentialId,
  }: {
    applicationAppId: string;
    credentialId: string;
  }) {
    const response = await fetchImpl(
      federatedCredentialUrl(applicationAppId, credentialId),
      {
        method: "DELETE",
        headers: await headers(),
      },
    );

    if (response.status !== 204 && response.status !== 404) {
      const text = await response.text();
      throw new Error(`Microsoft Graph request failed: ${response.status} ${text}`);
    }
  }

  async function createFederatedCredential({
    applicationAppId,
    name,
    subject,
  }: {
    applicationAppId: string;
    name: string;
    subject: string;
  }) {
    for (
      let attempt = 0;
      attempt <= FEDERATED_CREDENTIAL_RETRY_DELAYS_MS.length;
      attempt += 1
    ) {
      const response = await fetchImpl(
        federatedCredentialsUrl(applicationAppId),
        {
          method: "POST",
          headers: await headers(),
          body: JSON.stringify(federatedCredentialPayload({ name, subject })),
        },
      );

      if (response.status !== 409) {
        await readJson<unknown>(response);
        return;
      }

      const credentials = await listFederatedCredentials({ applicationAppId });

      if (credentials.some((credential) => credential.subject === subject)) {
        return;
      }

      if (attempt === FEDERATED_CREDENTIAL_RETRY_DELAYS_MS.length) {
        await readJson<unknown>(response);
      }

      await sleepImpl(FEDERATED_CREDENTIAL_RETRY_DELAYS_MS[attempt]);
    }
  }

  async function replaceFederatedCredential({
    applicationAppId,
    name,
    subject,
  }: {
    applicationAppId: string;
    name: string;
    subject: string;
  }) {
    const credentials = await listFederatedCredentials({ applicationAppId });
    const matchingSubject = credentials.find(
      (credential) => credential.subject === subject,
    );
    const stalePortalCredential = credentials.find(
      (credential) => credential.name === name && credential.subject !== subject,
    );

    if (stalePortalCredential) {
      await deleteFederatedCredential({
        applicationAppId,
        credentialId: stalePortalCredential.id,
      });
    }

    if (matchingSubject) {
      return;
    }

    await createFederatedCredential({ applicationAppId, name, subject });
  }

  async function hasRedirectUri({
    applicationObjectId,
    redirectUri,
  }: {
    applicationObjectId: string;
    redirectUri: string;
  }) {
    const application = await readJson<{ web?: { redirectUris?: string[] } }>(
      await fetchImpl(
        `https://graph.microsoft.com/v1.0/applications/${applicationObjectId}`,
        { method: "GET", headers: await headers() },
      ),
    );

    return { exists: Boolean(application.web?.redirectUris?.includes(redirectUri)) };
  }

  return {
    listFederatedCredentials,
    deleteFederatedCredential,
    replaceFederatedCredential,
    hasRedirectUri,
    async ensureRedirectUri({
      applicationObjectId,
      redirectUri,
    }: {
      applicationObjectId: string;
      redirectUri: string;
    }) {
      const application = await readJson<{ web?: { redirectUris?: string[] } }>(
        await fetchImpl(
          `https://graph.microsoft.com/v1.0/applications/${applicationObjectId}`,
          { method: "GET", headers: await headers() },
        ),
      );
      const redirectUris = application.web?.redirectUris ?? [];

      if (redirectUris.includes(redirectUri)) {
        return;
      }

      const response = await fetchImpl(
        `https://graph.microsoft.com/v1.0/applications/${applicationObjectId}`,
        {
          method: "PATCH",
          headers: await headers(),
          body: JSON.stringify({
            web: { redirectUris: [...redirectUris, redirectUri] },
          }),
        },
      );

      if (response.status !== 204) {
        const text = await response.text();
        throw new Error(
          `Microsoft Graph request failed: ${response.status} ${text}`,
        );
      }
    },
    async ensureFederatedCredential({
      applicationAppId,
      name,
      subject,
    }: {
      applicationAppId: string;
      name: string;
      subject: string;
    }) {
      const credentials = await listFederatedCredentials({ applicationAppId });
      const matchingSubject = credentials.find(
        (credential) => credential.subject === subject,
      );
      const stalePortalCredential = credentials.find(
        (credential) =>
          credential.name === name && credential.subject !== subject,
      );

      if (stalePortalCredential) {
        await deleteFederatedCredential({
          applicationAppId,
          credentialId: stalePortalCredential.id,
        });
      }

      if (matchingSubject) {
        return;
      }

      await createFederatedCredential({ applicationAppId, name, subject });
    },
  };
}
