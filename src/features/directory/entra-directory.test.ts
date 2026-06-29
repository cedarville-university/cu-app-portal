import { describe, expect, it, vi } from "vitest";
import { createEntraDirectoryClient, isCedarvilleMemberUser } from "./entra-directory";
import { loadDirectoryConfig } from "./config";

describe("directory config", () => {
  it("loads directory lookup configuration", () => {
    expect(
      loadDirectoryConfig({
        ENTRA_DIRECTORY_TENANT_ID: "tenant-123",
        ENTRA_DIRECTORY_CLIENT_ID: "client-123",
        ENTRA_DIRECTORY_CLIENT_SECRET: "secret-123",
        ENTRA_ALLOWED_EMAIL_DOMAIN: "cedarville.edu",
      }),
    ).toEqual({
      tenantId: "tenant-123",
      clientId: "client-123",
      clientSecret: "secret-123",
      allowedEmailDomain: "cedarville.edu",
    });
  });

  it("normalizes the allowed email domain at config load", () => {
    expect(
      loadDirectoryConfig({
        ENTRA_DIRECTORY_TENANT_ID: "tenant-123",
        ENTRA_DIRECTORY_CLIENT_ID: "client-123",
        ENTRA_DIRECTORY_CLIENT_SECRET: "secret-123",
        ENTRA_ALLOWED_EMAIL_DOMAIN: " Cedarville.EDU ",
      }).allowedEmailDomain,
    ).toBe("cedarville.edu");
  });
});

describe("isCedarvilleMemberUser", () => {
  it("accepts a member user with a Cedarville primary email", () => {
    expect(
      isCedarvilleMemberUser(
        {
          id: "entra-123",
          displayName: "Portal Staff",
          mail: "staff@cedarville.edu",
          userPrincipalName: "staff@cedarville.edu",
          userType: "Member",
          proxyAddresses: [],
          otherMails: [],
        },
        "staff@cedarville.edu",
        "cedarville.edu",
      ),
    ).toBe(true);
  });

  it("accepts a Cedarville alias returned by Entra", () => {
    expect(
      isCedarvilleMemberUser(
        {
          id: "entra-123",
          displayName: "Portal Staff",
          mail: "primary@cedarville.edu",
          userPrincipalName: "primary@cedarville.edu",
          userType: "Member",
          proxyAddresses: ["SMTP:primary@cedarville.edu", "smtp:alias@cedarville.edu"],
          otherMails: [],
        },
        "alias@cedarville.edu",
        "cedarville.edu",
      ),
    ).toBe(true);
  });

  it("rejects a non-Cedarville submitted email even when the member has Cedarville aliases", () => {
    expect(
      isCedarvilleMemberUser(
        {
          id: "entra-123",
          displayName: "Portal Staff",
          mail: "primary@cedarville.edu",
          userPrincipalName: "primary@cedarville.edu",
          userType: "Member",
          proxyAddresses: ["SMTP:primary@cedarville.edu", "smtp:alias@cedarville.edu"],
          otherMails: ["external@example.com"],
        },
        "external@example.com",
        "cedarville.edu",
      ),
    ).toBe(false);
  });

  it("rejects guest users and non-Cedarville addresses", () => {
    expect(
      isCedarvilleMemberUser(
        {
          id: "entra-123",
          displayName: "External Guest",
          mail: "guest@example.com",
          userPrincipalName: "guest_example.com#EXT#@cedarville.edu",
          userType: "Guest",
          proxyAddresses: [],
          otherMails: [],
        },
        "guest@example.com",
        "cedarville.edu",
      ),
    ).toBe(false);
  });
});

describe("createEntraDirectoryClient", () => {
  it("fetches and normalizes a matching user by email", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            {
              id: "entra-123",
              displayName: "Portal Staff",
              mail: "staff@cedarville.edu",
              userPrincipalName: "staff@cedarville.edu",
              userType: "Member",
              proxyAddresses: ["SMTP:staff@cedarville.edu"],
              otherMails: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const client = createEntraDirectoryClient({
      tokenProvider: async () => "token-123",
      allowedEmailDomain: "cedarville.edu",
      fetchImpl,
    });

    await expect(client.findEligibleUserByEmail("Staff@Cedarville.edu")).resolves.toEqual({
      entraOid: "entra-123",
      displayName: "Portal Staff",
      email: "staff@cedarville.edu",
      aliases: ["staff@cedarville.edu"],
    });
  });

  it("returns the submitted Cedarville alias when primary Entra addresses are external", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            {
              id: "entra-123",
              displayName: "Portal Staff",
              mail: "external@example.com",
              userPrincipalName: "external@example.com",
              userType: "Member",
              proxyAddresses: ["smtp:alias@cedarville.edu"],
              otherMails: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const client = createEntraDirectoryClient({
      tokenProvider: async () => "token-123",
      allowedEmailDomain: "cedarville.edu",
      fetchImpl,
    });

    await expect(client.findEligibleUserByEmail("alias@cedarville.edu")).resolves.toEqual({
      entraOid: "entra-123",
      displayName: "Portal Staff",
      email: "alias@cedarville.edu",
      aliases: ["alias@cedarville.edu"],
    });
  });

  it("escapes apostrophes in OData filter string literals before URL encoding", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [],
        }),
        { status: 200 },
      ),
    );
    const client = createEntraDirectoryClient({
      tokenProvider: async () => "token-123",
      allowedEmailDomain: "cedarville.edu",
      fetchImpl,
    });

    await client.findEligibleUserByEmail("O'Brien@Cedarville.edu");

    const requestedUrl = new URL(fetchImpl.mock.calls[0][0]);
    expect(requestedUrl.searchParams.get("$filter")).toContain(
      "mail eq 'o''brien@cedarville.edu'",
    );
    expect(requestedUrl.searchParams.get("$filter")).toContain(
      "proxyAddresses/any(p:p eq 'smtp:o''brien@cedarville.edu')",
    );
  });
});
