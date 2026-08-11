import { describe, expect, it, vi } from "vitest";

import { createMicrosoftGraphClient } from "./graph-client";

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

describe("createMicrosoftGraphClient", () => {
  it("adds a redirect uri only when it is missing", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(json({ web: { redirectUris: ["https://old/cb"] } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.ensureRedirectUri({
      applicationObjectId: "app-object-id",
      redirectUri:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
    });

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://graph.microsoft.com/v1.0/applications/app-object-id",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          web: {
            redirectUris: [
              "https://old/cb",
              "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
            ],
          },
        }),
      }),
    );
  });

  it("does not patch when the redirect uri already exists", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json({
          web: {
            redirectUris: [
              "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
            ],
          },
        }),
      );
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.ensureRedirectUri({
      applicationObjectId: "app-object-id",
      redirectUri:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/applications/app-object-id",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a federated credential for a repository branch", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(json({ value: [] }))
      .mockResolvedValueOnce(json({ id: "credential-id" }, { status: 201 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.ensureFederatedCredential({
      applicationAppId: "client-id",
      name: "github-campus-dashboard-clx9abc1",
      subject: "repo:cedarville-it/campus-dashboard:ref:refs/heads/main",
    });

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://graph.microsoft.com/v1.0/applications(appId='client-id')/federatedIdentityCredentials",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "github-campus-dashboard-clx9abc1",
          issuer: "https://token.actions.githubusercontent.com",
          subject: "repo:cedarville-it/campus-dashboard:ref:refs/heads/main",
          audiences: ["api://AzureADTokenExchange"],
        }),
      }),
    );
  });

  it("replaces a federated credential by name", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json({
          value: [{ id: "credential-id", name: "github-campus-dashboard" }],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ id: "new-credential-id" }, { status: 201 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.replaceFederatedCredential({
      applicationAppId: "client-id",
      name: "github-campus-dashboard",
      subject:
        "repo:cedarville-it@654321/campus-dashboard@123456:ref:refs/heads/main",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://graph.microsoft.com/v1.0/applications(appId='client-id')/federatedIdentityCredentials/credential-id",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://graph.microsoft.com/v1.0/applications(appId='client-id')/federatedIdentityCredentials",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("removes a stale portal credential and reuses an existing matching subject", async () => {
    const subject =
      "repo:cu-app-portal-repos@280105215/slide-show-inator@1330196457:ref:refs/heads/main";
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json({
          value: [
            {
              id: "stale-credential-id",
              name: "github-slide-show-inator",
              subject:
                "repo:cu-app-portal-repos/slide-show-inator:ref:refs/heads/main",
            },
            {
              id: "matching-credential-id",
              name: "manually-repaired-slide-show-inator",
              subject,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.replaceFederatedCredential({
      applicationAppId: "client-id",
      name: "github-slide-show-inator",
      subject,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://graph.microsoft.com/v1.0/applications(appId='client-id')/federatedIdentityCredentials/stale-credential-id",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("retries creation when Graph still sees a recently deleted credential", async () => {
    const subject =
      "repo:cu-app-portal-repos@280105215/slide-show-inator@1330196457:ref:refs/heads/main";
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json({
          value: [
            {
              id: "stale-credential-id",
              name: "github-slide-show-inator",
              subject:
                "repo:cu-app-portal-repos/slide-show-inator:ref:refs/heads/main",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        text("FederatedIdentityCredential already exists", { status: 409 }),
      )
      .mockResolvedValueOnce(json({ value: [] }))
      .mockResolvedValueOnce(json({ id: "new-credential-id" }, { status: 201 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
      sleepImpl,
    });

    await client.replaceFederatedCredential({
      applicationAppId: "client-id",
      name: "github-slide-show-inator",
      subject,
    });

    expect(sleepImpl).toHaveBeenCalledWith(250);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://graph.microsoft.com/v1.0/applications(appId='client-id')/federatedIdentityCredentials",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("checks whether a redirect uri exists", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json({
          web: {
            redirectUris: [
              "https://app-campus-dashboard.azurewebsites.net/api/auth/callback/microsoft-entra-id",
            ],
          },
        }),
      );
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.hasRedirectUri({
        applicationObjectId: "app-object-id",
        redirectUri:
          "https://app-campus-dashboard.azurewebsites.net/api/auth/callback/microsoft-entra-id",
      }),
    ).resolves.toEqual({ exists: true });
  });

  it("does not replace an existing credential with the expected subject", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json({
          value: [
            {
              id: "credential-id",
              name: "github-campus-dashboard-clx9abc1",
              subject:
                "repo:cedarville-it/campus-dashboard:ref:refs/heads/main",
            },
          ],
        }),
      );
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.ensureFederatedCredential({
        applicationAppId: "client-id",
        name: "github-campus-dashboard-clx9abc1",
        subject: "repo:cedarville-it/campus-dashboard:ref:refs/heads/main",
      }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("removes a stale legacy credential before adding the immutable subject", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        json({
          value: [
            {
              id: "credential-id",
              name: "github-slide-show-inator",
              subject:
                "repo:cu-app-portal-repos/slide-show-inator:ref:refs/heads/main",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ id: "new-credential-id" }, { status: 201 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });
    const subject =
      "repo:cu-app-portal-repos@280105215/slide-show-inator@1330196457:ref:refs/heads/main";

    await client.ensureFederatedCredential({
      applicationAppId: "client-id",
      name: "github-slide-show-inator",
      subject,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://graph.microsoft.com/v1.0/applications(appId='client-id')/federatedIdentityCredentials/credential-id",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://graph.microsoft.com/v1.0/applications(appId='client-id')/federatedIdentityCredentials",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "github-slide-show-inator",
          issuer: "https://token.actions.githubusercontent.com",
          subject,
          audiences: ["api://AzureADTokenExchange"],
        }),
      }),
    );
  });

  it("throws the Graph response status and text for non-JSON error bodies", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(text("plain Graph failure", { status: 500 }));
    const client = createMicrosoftGraphClient({
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.ensureRedirectUri({
        applicationObjectId: "app-object-id",
        redirectUri:
          "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
      }),
    ).rejects.toThrow(
      "Microsoft Graph request failed: 500 plain Graph failure",
    );
  });

  it.each([200, 202])(
    "throws the Graph response status and text when PATCH returns %s",
    async (status) => {
      const fetchImpl = vi
        .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
        .mockResolvedValueOnce(json({ web: { redirectUris: [] } }))
        .mockResolvedValueOnce(text("unexpected patch status", { status }));
      const client = createMicrosoftGraphClient({
        tokenProvider: async () => "token",
        fetchImpl,
      });

      await expect(
        client.ensureRedirectUri({
          applicationObjectId: "app-object-id",
          redirectUri:
            "https://app-campus-dashboard-clx9abc1.azurewebsites.net/api/auth/callback/microsoft-entra-id",
        }),
      ).rejects.toThrow(
        `Microsoft Graph request failed: ${status} unexpected patch status`,
      );
    },
  );
});
