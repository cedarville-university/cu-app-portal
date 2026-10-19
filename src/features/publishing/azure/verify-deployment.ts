import type { VerificationResult } from "../run-publish-attempt";

type VerifyOptions = {
  fetchImpl?: typeof fetch;
};

export async function verifyPublishedUrl(
  publishUrl: string,
  { fetchImpl = fetch }: VerifyOptions = {},
): Promise<VerificationResult> {
  const healthUrl = new URL("/api/health", publishUrl).toString();
  const probe = (url: string) => fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });

  let healthStatus: number | undefined;
  try {
    healthStatus = (await probe(healthUrl)).status;
    if (healthStatus === 200) return { verifiedAt: new Date() };
  } catch {
    // Imported apps may serve their root even without a working health route.
  }

  let rootStatus: number | undefined;
  try {
    rootStatus = (await probe(new URL("/", publishUrl).toString())).status;
  } catch {
    // Preserve the health-check failure if neither endpoint can be verified.
  }

  if (rootStatus === 200) {
    const reason = healthStatus === 404 || healthStatus === 410
      ? "is missing"
      : healthStatus === undefined
        ? "could not be reached"
        : `returned HTTP ${healthStatus}`;
    return {
      verifiedAt: new Date(),
      warningSummary: `Published with a warning: the health check path /api/health ${reason}. The root path / returned HTTP 200.`,
    };
  }

  throw new Error(
    `Published URL ${publishUrl} health endpoint did not return a healthy response. Status: ${healthStatus ?? "unreachable"}. Root path status: ${rootStatus ?? "unreachable"}.`,
  );
}
