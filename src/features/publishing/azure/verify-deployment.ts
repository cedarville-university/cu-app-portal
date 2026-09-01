type VerifyOptions = {
  fetchImpl?: typeof fetch;
};

function isMicrosoftLoginRedirect(location: string | null) {
  if (!location) {
    return false;
  }

  try {
    const redirectUrl = new URL(location);
    return (
      redirectUrl.protocol === "https:" &&
      redirectUrl.hostname.toLowerCase() === "login.microsoftonline.com" &&
      redirectUrl.port === ""
    );
  } catch {
    return false;
  }
}

function isGeneratedAuthRedirect(publishUrl: string, location: string | null) {
  if (!location) {
    return false;
  }

  try {
    const publishedUrl = new URL(publishUrl);
    const redirectUrl = new URL(location, publishedUrl);
    return (
      redirectUrl.origin === publishedUrl.origin &&
      (redirectUrl.pathname === "/login" ||
        redirectUrl.pathname === "/api/auth/signin")
    );
  } catch {
    return false;
  }
}

async function verifyPublicHealthEndpoint(
  publishUrl: string,
  fetchImpl: typeof fetch,
) {
  const healthUrl = new URL("/api/health", publishUrl).toString();
  const response = await fetchImpl(healthUrl, {
    method: "GET",
    redirect: "manual",
  });

  if (response.status === 200) {
    return;
  }

  throw new Error(
    `Published URL ${publishUrl} health endpoint did not return a healthy response. Status: ${response.status}.`,
  );
}

export async function verifyPublishedUrl(
  publishUrl: string,
  { fetchImpl = fetch }: VerifyOptions = {},
) {
  const response = await fetchImpl(publishUrl, {
    method: "GET",
    redirect: "manual",
  });
  const location = response.headers.get("location") ?? "";

  if (
    response.status === 200 ||
    (response.status >= 300 &&
      response.status < 400 &&
      isMicrosoftLoginRedirect(location))
  ) {
    return { verifiedAt: new Date() };
  }

  if (
    response.status >= 300 &&
    response.status < 400 &&
    isGeneratedAuthRedirect(publishUrl, location)
  ) {
    await verifyPublicHealthEndpoint(publishUrl, fetchImpl);
    return { verifiedAt: new Date() };
  }

  if (response.status >= 400) {
    await verifyPublicHealthEndpoint(publishUrl, fetchImpl);
    return { verifiedAt: new Date() };
  }

  throw new Error(
    `Published URL ${publishUrl} did not return a healthy response. Status: ${response.status}.`,
  );
}
