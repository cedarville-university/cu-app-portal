const PROFILE_STEP = "/onboarding/github";

function localDestination(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u0020\\]/.test(value)) return null;
  const configuredOrigin = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? process.env.PORTAL_APP_URL;
  try {
    const base = new URL(configuredOrigin ?? "https://cu-launch.invalid");
    if (!value.startsWith("/") && !configuredOrigin) return null;
    const destination = new URL(value, base.origin);
    if (destination.origin !== base.origin || destination.username || destination.password) return null;
    const decodedPath = decodeURIComponent(destination.pathname);
    if (decodedPath.startsWith("//") || /[\\\u0000-\u0020]/.test(decodedPath)) return null;
    return destination;
  } catch {
    return null;
  }
}

export function getSafePortalReturnTo(value: unknown): string {
  const destination = localDestination(value);
  if (!destination) return "/";
  const pathname = decodeURIComponent(destination.pathname).replace(/\/+$/, "").toLowerCase();
  if (pathname === "/login" || pathname.startsWith("/login/") || pathname === "/api/auth" || pathname.startsWith("/api/auth/") || pathname === PROFILE_STEP || pathname.startsWith(`${PROFILE_STEP}/`)) return "/";
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function getGitHubProfileSetupUrl(value: unknown): string {
  const destination = localDestination(value);
  // Middleware may send an unauthenticated setup-page visit through /login.
  // Unwrap its destination once instead of nesting setup redirects.
  const alreadySetup = destination && decodeURIComponent(destination.pathname).replace(/\/+$/, "") === PROFILE_STEP;
  const returnTo = getSafePortalReturnTo(alreadySetup ? destination.searchParams.get("returnTo") : value);
  return `${PROFILE_STEP}?returnTo=${encodeURIComponent(returnTo)}`;
}
