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
});
