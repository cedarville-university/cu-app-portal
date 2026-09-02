import { buildManagedAppPortalSkill } from "./portal-skill";

const PREVIOUS_COMPATIBILITY_GUIDANCE = `2. Determine whether it is already one of the CU Launch-supported root app types: root Next.js, Express, Python FastAPI, or a plain static app with a root \`index.html\` that can run with Python \`http.server\`.
3. If it is already supported, preserve its framework and behavior. Do not migrate it merely to make it resemble a portal starter.
4. If it is unsupported, evaluate the smallest safe migration to one supported app type. Choose the option most likely to preserve the app's user-visible behavior, data, routes, integrations, and existing tests with the fewest structural changes.
5. Explain the proposed migration and its visible impact in plain language before making it. If two reasonable migrations would change what the app can do, ask exactly one plain-language question and wait for the user's choice.
6. Keep a recoverable Git history. Do not delete the original implementation or discard existing commits to simplify a migration.
7. Use compatible system or bundled workspace runtimes to install dependencies and run the relevant build and tests. Do not upload a migration whose relevant tests fail.
8. After a successful migration and verification, commit and push the changed app to the CU Launch-managed repository. The user performs the next CU Launch confirmation.`;

const PREVIOUS_HEALTH_GUIDANCE = "- Keep the exact `GET /api/health` endpoint public and returning HTTP 200 when the app process is healthy. Never protect, remove, rename, or make that endpoint depend on an allow list, session, database, or external service; CU Launch uses it to verify deployments.\n";
const PREVIOUS_AUDIENCE_GUIDANCE = "- Treat a request to limit the app audience as an authentication change. Use the CU Launch-managed Cedarville Microsoft Entra login screen and a verified Entra session before showing protected app content, then enforce the requested email, group, or role restriction server-side. Do not rely on a standalone allow list or client-side-only check. Keep only the exact public health endpoint plus the framework's required Entra sign-in and callback routes anonymous.\n";

export function buildImmediatelyPreviousManagedAppPortalSkillForTest() {
  return buildManagedAppPortalSkill().replace(PREVIOUS_AUDIENCE_GUIDANCE, "");
}

export function buildPreviousManagedAppPortalSkillForTest() {
  const currentSkill = buildManagedAppPortalSkill();
  const currentStart = currentSkill.indexOf("2. Match CU Launch's exact static-app rule.");
  const currentEndText =
    "12. After a successful migration and verification, commit and push the changed app to the CU Launch-managed repository. The user performs the next CU Launch confirmation.";
  const currentEnd = currentSkill.indexOf(currentEndText, currentStart);

  if (currentStart < 0 || currentEnd < 0) {
    throw new Error("Current compatibility guidance could not be located.");
  }

  return `${currentSkill.slice(0, currentStart)}${PREVIOUS_COMPATIBILITY_GUIDANCE}${currentSkill.slice(currentEnd + currentEndText.length)}`.replace(
    PREVIOUS_AUDIENCE_GUIDANCE,
    "",
  ).replace(PREVIOUS_HEALTH_GUIDANCE, "");
}
