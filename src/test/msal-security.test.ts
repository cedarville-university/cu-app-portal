// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHttpHeaders, type PipelineRequest } from "@azure/core-rest-pipeline";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagedIdentityCredential, ClientSecretCredential } from "@azure/identity";

afterEach(() => vi.unstubAllEnvs());

describe("MSAL security update", () => {
  it.each(["package-lock.json", "workers/publish/package-lock.json", "workers/repository-import/package-lock.json"])("ships only patched MSAL Node versions in %s", path => {
    const lock = JSON.parse(readFileSync(path, "utf8")) as { packages: Record<string, { version?: string }> };
    const entries = Object.entries(lock.packages).filter(([key]) => /(?:^|\/)node_modules\/@azure\/msal-node$/.test(key));
    expect(entries.length).toBeGreaterThan(0);
    for (const [, pkg] of entries) {
      const [major, minor] = (pkg.version ?? "0.0.0").split(".").map(Number);
      expect(major > 7 || major === 7 && minor >= 1).toBe(true);
      expect(pkg.version).not.toContain("-");
    }
  });

  it("preserves App Service managed-identity token acquisition without contacting Azure", async () => {
    const requests: PipelineRequest[] = [];
    vi.stubEnv("IDENTITY_ENDPOINT", "http://127.0.0.1:40127/msi/token");
    vi.stubEnv("IDENTITY_HEADER", "offline-identity-header");
    const credential = new ManagedIdentityCredential({
      clientId: "11111111-1111-1111-1111-111111111111",
      httpClient: { async sendRequest(request) {
        requests.push(request);
        expect(new URL(request.url).origin).toBe("http://127.0.0.1:40127");
        return { request, status: 200, headers: createHttpHeaders(), bodyAsText: JSON.stringify({ access_token: "offline-managed-identity-token", expires_on: String(Math.floor(Date.now() / 1000) + 3600), token_type: "Bearer", resource: "https://management.azure.com/", client_id: "11111111-1111-1111-1111-111111111111" }) };
      } },
    });
    const result = await credential.getToken("https://management.azure.com/.default");
    expect(result.token).toBe("offline-managed-identity-token");
    expect(result.expiresOnTimestamp).toBeGreaterThan(Date.now());
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("resource=https%3A%2F%2Fmanagement.azure.com");
    expect(requests[0].headers.get("x-identity-header")).toBe("offline-identity-header");
  });
});


it("preserves client-secret token acquisition through the actual SDK with offline transport", async () => {
  const requests: PipelineRequest[] = [];
  const tenant = "22222222-2222-2222-2222-222222222222";
  const base = `https://login.microsoftonline.com/${tenant}`;
  const credential = new ClientSecretCredential(tenant, "33333333-3333-3333-3333-333333333333", "offline-client-secret", {
    disableInstanceDiscovery: true,
    httpClient: { async sendRequest(request) {
      requests.push(request);
      expect(new URL(request.url).hostname).toBe("login.microsoftonline.com");
      const body = request.url.includes(".well-known") ? { authorization_endpoint: `${base}/oauth2/v2.0/authorize`, token_endpoint: `${base}/oauth2/v2.0/token`, issuer: `${base}/v2.0`, jwks_uri: `${base}/discovery/v2.0/keys` } : { access_token: "offline-client-token", expires_in: 3600, token_type: "Bearer", ext_expires_in: 3600 };
      return { request, status: 200, headers: createHttpHeaders(), bodyAsText: JSON.stringify(body) };
    } },
  });
  const result = await credential.getToken("https://graph.microsoft.com/.default");
  expect(result.token).toBe("offline-client-token");
  expect(result.expiresOnTimestamp).toBeGreaterThan(Date.now());
  const tokenRequest = requests.find(r => new URL(r.url).pathname.endsWith("/token"));
  expect(tokenRequest?.body).toContain("grant_type=client_credentials");
  expect(tokenRequest?.body).toContain("client_secret=offline-client-secret");
});

it.each(["attacker.invalid", "login.microsoftonline.com.attacker.invalid"])("does not send authorization-code parameters to %s", async hostileHost => {
  const { ConfidentialClientApplication } = await import("@azure/msal-node");
  const tokenEndpoints: string[] = [];
  const authority = "https://login.microsoftonline.com/44444444-4444-4444-4444-444444444444";
  const app = new ConfidentialClientApplication({
    auth: {
      clientId: "55555555-5555-5555-5555-555555555555", clientSecret: "offline-auth-code-secret", authority,
      authorityMetadata: JSON.stringify({ authorization_endpoint: `${authority}/oauth2/v2.0/authorize`, token_endpoint: `${authority}/oauth2/v2.0/token`, issuer: `${authority}/v2.0`, jwks_uri: `${authority}/discovery/v2.0/keys` }),
    },
    system: { networkClient: {
      async sendGetRequestAsync<T>() { throw new Error("Unexpected discovery request in offline test."); },
      async sendPostRequestAsync<T>(url: string) {
        tokenEndpoints.push(url);
        return { headers: {}, status: 200, body: { access_token: "offline-auth-code-token", token_type: "Bearer", expires_in: 3600, scope: "scope" } as T };
      },
    } },
  });
  const result = await app.acquireTokenByCode({ code: "legitimate-code", redirectUri: "https://app.example.invalid/callback", scopes: ["scope"] }, { code: "attacker-code", cloud_instance_host_name: hostileHost });
  expect(result?.accessToken).toBe("offline-auth-code-token");
  expect(tokenEndpoints.map(value => { const url = new URL(value); return url.origin + url.pathname; })).toEqual([`${authority}/oauth2/v2.0/token`]);
});
