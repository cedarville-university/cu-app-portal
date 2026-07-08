import { describe, expect, it, vi } from "vitest";

import { createKeyVaultClient } from "./key-vault-client";

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

describe("createKeyVaultClient", () => {
  it("sets a secret value", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(json({ value: "s3cret" }));
    const client = createKeyVaultClient({
      vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net/",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.setSecret({ name: "API-KEY", value: "s3cret" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://kv-campus-dashb-clx9abc1.vault.azure.net/secrets/API-KEY?api-version=7.4",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
        body: JSON.stringify({ value: "s3cret" }),
      }),
    );
  });

  it("throws the response status and text on failure", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(text("forbidden", { status: 403 }));
    const client = createKeyVaultClient({
      vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.setSecret({ name: "API-KEY", value: "s3cret" }),
    ).rejects.toThrow("Azure Key Vault request failed: 403 forbidden");
  });

  it("deletes a secret and tolerates a missing secret", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(json({ deletedDate: 1 }))
      .mockResolvedValueOnce(text("not found", { status: 404 }));
    const client = createKeyVaultClient({
      vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.deleteSecret({ name: "API-KEY" });
    await client.deleteSecret({ name: "MISSING" });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://kv-campus-dashb-clx9abc1.vault.azure.net/secrets/API-KEY?api-version=7.4",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
