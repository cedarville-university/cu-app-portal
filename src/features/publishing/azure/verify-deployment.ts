type VerifyOptions = {
  fetchImpl?: typeof fetch;
};

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
  await verifyPublicHealthEndpoint(publishUrl, fetchImpl);
  return { verifiedAt: new Date() };
}
