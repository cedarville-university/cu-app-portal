type FetchLike = typeof fetch;

export type EntraUserRecord = {
  id: string;
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string | null;
  userType: string | null;
  proxyAddresses?: string[] | null;
  otherMails?: string[] | null;
};

export type EligibleDirectoryUser = {
  entraOid: string;
  displayName: string;
  email: string;
  aliases: string[];
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function stripProxyPrefix(address: string) {
  return address.replace(/^smtp:/i, "");
}

function escapeODataStringLiteral(value: string) {
  return value.replaceAll("'", "''");
}

function allEmails(user: EntraUserRecord) {
  return [
    user.mail,
    user.userPrincipalName,
    ...(user.proxyAddresses ?? []).map(stripProxyPrefix),
    ...(user.otherMails ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeEmail);
}

function hasAllowedDomain(email: string, allowedEmailDomain: string) {
  return normalizeEmail(email).endsWith(`@${allowedEmailDomain.toLowerCase()}`);
}

export function isCedarvilleMemberUser(
  user: EntraUserRecord,
  submittedEmail: string,
  allowedEmailDomain: string,
) {
  if (user.userType !== "Member") {
    return false;
  }

  const normalizedSubmittedEmail = normalizeEmail(submittedEmail);
  const emails = allEmails(user);

  return (
    hasAllowedDomain(normalizedSubmittedEmail, allowedEmailDomain) &&
    emails.includes(normalizedSubmittedEmail) &&
    emails.some((email) => hasAllowedDomain(email, allowedEmailDomain))
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Microsoft Graph request failed: ${response.status} ${text}`);
  }

  return JSON.parse(text) as T;
}

export function createEntraDirectoryClient({
  tokenProvider,
  allowedEmailDomain,
  fetchImpl = fetch,
}: {
  tokenProvider: () => Promise<string>;
  allowedEmailDomain: string;
  fetchImpl?: FetchLike;
}) {
  async function headers() {
    return {
      Authorization: `Bearer ${await tokenProvider()}`,
      "Content-Type": "application/json",
    };
  }

  return {
    async findEligibleUserByEmail(email: string): Promise<EligibleDirectoryUser | null> {
      const normalizedEmail = normalizeEmail(email);
      const escapedEmail = escapeODataStringLiteral(normalizedEmail);
      const filter = encodeURIComponent(
        `mail eq '${escapedEmail}' or userPrincipalName eq '${escapedEmail}' or proxyAddresses/any(p:p eq 'smtp:${escapedEmail}') or proxyAddresses/any(p:p eq 'SMTP:${escapedEmail}') or otherMails/any(m:m eq '${escapedEmail}')`,
      );
      const select = [
        "id",
        "displayName",
        "mail",
        "userPrincipalName",
        "userType",
        "proxyAddresses",
        "otherMails",
      ].join(",");
      const data = await readJson<{ value?: EntraUserRecord[] }>(
        await fetchImpl(
          `https://graph.microsoft.com/v1.0/users?$select=${select}&$filter=${filter}`,
          { method: "GET", headers: await headers() },
        ),
      );
      const user = (data.value ?? []).find((candidate) =>
        isCedarvilleMemberUser(candidate, normalizedEmail, allowedEmailDomain),
      );

      if (!user) {
        return null;
      }

      const aliases = Array.from(new Set(allEmails(user))).filter((alias) =>
        hasAllowedDomain(alias, allowedEmailDomain),
      );

      return {
        entraOid: user.id,
        displayName: user.displayName ?? aliases[0] ?? normalizedEmail,
        email: normalizeEmail(user.mail ?? user.userPrincipalName ?? normalizedEmail),
        aliases,
      };
    },
  };
}
