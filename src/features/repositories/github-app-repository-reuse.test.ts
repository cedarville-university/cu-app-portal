// @vitest-environment node

import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createGitHubAppClient } from "./github-app";

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

describe("createGitHubAppClient repository reuse", () => {
  const ownershipMarker = {
    description: "Cedarville App Portal request:request-123",
    path: "app-portal/managed-request.json",
    content:
      '{\n  "schemaVersion": "1.0.0",\n  "appRequestId": "request-123"\n}\n',
  };

  it("rejects a generic 422 instead of treating it as an owned repository", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(
        createJsonResponse(
          { message: "Validation Failed", errors: [{ field: "visibility" }] },
          { status: 422, statusText: "Unprocessable Entity" },
        ),
      );
    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    await expect(
      client.createRepository({
        owner: "cedarville-it",
        name: "campus-dashboard-request-123",
        visibility: "private",
        files: {},
        defaultBranch: "main",
        reuseIfAlreadyExists: true,
        ownershipMarker,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects a duplicate target whose ownership marker belongs to another request", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            message: "Repository creation failed.",
            errors: [
              {
                resource: "Repository",
                field: "name",
                code: "custom",
                message: "name already exists on this account",
              },
            ],
          },
          { status: 422, statusText: "Unprocessable Entity" },
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          id: 77,
          html_url:
            "https://github.com/cedarville-it/campus-dashboard-request-123",
          default_branch: "main",
          name: "campus-dashboard-request-123",
          description: "Cedarville App Portal request:another-request",
          owner: { id: 11, login: "cedarville-it" },
        }),
      );
    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    await expect(
      client.createRepository({
        owner: "cedarville-it",
        name: "campus-dashboard-request-123",
        visibility: "private",
        files: { "README.md": "# Campus Dashboard\n" },
        defaultBranch: "main",
        reuseIfAlreadyExists: true,
        ownershipMarker,
      }),
    ).rejects.toThrow(/does not belong to this app request/i);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("reuses an owned partial repository and preserves its existing tree", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            message: "Repository creation failed.",
            errors: [
              {
                resource: "Repository",
                field: "name",
                code: "custom",
                message: "name already exists on this account",
              },
            ],
          },
          { status: 422, statusText: "Unprocessable Entity" },
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          html_url: "https://github.com/cedarville-it/campus-dashboard",
          default_branch: "main",
          name: "campus-dashboard",
          description: ownershipMarker.description,
          owner: { login: "cedarville-it" },
        }),
      )
      .mockResolvedValueOnce(createJsonResponse({ object: { sha: "seed-commit-sha" } }))
      .mockResolvedValueOnce(
        createJsonResponse({ sha: "seed-commit-sha", tree: { sha: "seed-tree-sha" } }),
      )
      .mockResolvedValueOnce(createJsonResponse({ sha: "blob-sha-1" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "marker-blob-sha" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "tree-sha-1" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "commit-sha-1" }))
      .mockResolvedValueOnce(createJsonResponse({ object: { sha: "seed-commit-sha" } }))
      .mockResolvedValueOnce(createJsonResponse({ ref: "refs/heads/main" }))
      .mockResolvedValueOnce(
        createJsonResponse({
          html_url: "https://github.com/cedarville-it/campus-dashboard",
          default_branch: "main",
          name: "campus-dashboard",
          owner: { login: "cedarville-it" },
        }),
      );

    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    const repository = await client.createRepository({
      owner: "cedarville-it",
      name: "campus-dashboard",
      visibility: "private",
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      defaultBranch: "main",
      reuseIfAlreadyExists: true,
      ownershipMarker,
    });

    expect(repository).toEqual({
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://api.github.com/repos/cedarville-it/campus-dashboard",
      expect.objectContaining({ method: "GET" }),
    );
    const treeRequest = fetchImpl.mock.calls.find(([url]) =>
      String(url).endsWith("/git/trees"),
    );
    expect(JSON.parse(String(treeRequest?.[1]?.body))).toMatchObject({
      base_tree: "seed-tree-sha",
      tree: expect.arrayContaining([
        expect.objectContaining({ path: "README.md" }),
        expect.objectContaining({ path: ownershipMarker.path }),
      ]),
    });
  });

  it("refuses to advance a reused repository when its head changes", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            message: "Repository creation failed.",
            errors: [
              {
                resource: "Repository",
                field: "name",
                code: "custom",
                message: "name already exists on this account",
              },
            ],
          },
          { status: 422, statusText: "Unprocessable Entity" },
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          html_url: "https://github.com/cedarville-it/campus-dashboard",
          default_branch: "main",
          name: "campus-dashboard",
          description: ownershipMarker.description,
          owner: { login: "cedarville-it" },
        }),
      )
      .mockResolvedValueOnce(createJsonResponse({ object: { sha: "expected-head" } }))
      .mockResolvedValueOnce(
        createJsonResponse({ sha: "expected-head", tree: { sha: "base-tree" } }),
      )
      .mockResolvedValueOnce(createJsonResponse({ sha: "blob-sha" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "marker-blob-sha" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "new-tree" }))
      .mockResolvedValueOnce(createJsonResponse({ sha: "new-commit" }))
      .mockResolvedValueOnce(createJsonResponse({ object: { sha: "changed-head" } }));
    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    await expect(
      client.createRepository({
        owner: "cedarville-it",
        name: "campus-dashboard-request-123",
        visibility: "private",
        files: { "README.md": "# Campus Dashboard\n" },
        defaultBranch: "main",
        reuseIfAlreadyExists: true,
        ownershipMarker,
      }),
    ).rejects.toThrow(/repository changed/i);
    expect(
      fetchImpl.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/git/refs/heads/main") && init?.method === "PATCH",
      ),
    ).toBe(false);
  });
});
