import { buildManagedAppPortalSkill } from "./portal-skill";

const PREVIOUS_COMPATIBILITY_GUIDANCE = `2. Determine whether it is already one of the portal-supported root app types: root Next.js, Express, Python FastAPI, or a plain static app with a root \`index.html\` that can run with Python \`http.server\`.
3. If it is already supported, preserve its framework and behavior. Do not migrate it merely to make it resemble a portal starter.
4. If it is unsupported, evaluate the smallest safe migration to one supported app type. Choose the option most likely to preserve the app's user-visible behavior, data, routes, integrations, and existing tests with the fewest structural changes.
5. Explain the proposed migration and its visible impact in plain language before making it. If two reasonable migrations would change what the app can do, ask exactly one plain-language question and wait for the user's choice.
6. Keep a recoverable Git history. Do not delete the original implementation or discard existing commits to simplify a migration.
7. Use compatible system or bundled workspace runtimes to install dependencies and run the relevant build and tests. Do not upload a migration whose relevant tests fail.
8. After a successful migration and verification, commit and push the changed app to the portal-managed repository. The user performs the next portal confirmation.`;

export function buildPreviousManagedAppPortalSkillForTest() {
  const currentSkill = buildManagedAppPortalSkill();
  const currentStart = currentSkill.indexOf("2. Match the portal's exact static-app rule.");
  const currentEndText =
    "12. After a successful migration and verification, commit and push the changed app to the portal-managed repository. The user performs the next portal confirmation.";
  const currentEnd = currentSkill.indexOf(currentEndText, currentStart);

  if (currentStart < 0 || currentEnd < 0) {
    throw new Error("Current compatibility guidance could not be located.");
  }

  return `${currentSkill.slice(0, currentStart)}${PREVIOUS_COMPATIBILITY_GUIDANCE}${currentSkill.slice(currentEnd + currentEndText.length)}`;
}
