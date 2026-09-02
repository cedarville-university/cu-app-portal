import { createHash } from "node:crypto";

export const PORTAL_SKILL_PATH = ".codex/skills/cu-app-portal/SKILL.md";
export const LEGACY_PUBLISH_SKILL_PATH =
  ".codex/skills/publish-to-azure/SKILL.md";

const PREVIOUS_MANAGED_APP_PORTAL_SKILL_HASHES = new Set([
  "5ce4c7a302c86ecbdabda0ea68ed4dd763a741030ca7413686afa35e15998c28",
  "79e98100ee0299dcd3c68ca9efcce2fa80de774e41fc524645b01fd84dcdb926",
  "54a3d32e89b6136ad0f0296feea5ff01321034e9d52acb9a752347ee6e5021cb",
  "05d2a8b01a003ace8b7fbb337b875972ac7c9b6a15718ae10f3360fcf2eb8d99",
  "a965b6c09a50d2757eef4ec7a6bedffb9ab8baa107cab002016b41ffc419ad30",
  "42a92cda7d50cbd480f35d07e4b24556a936b1e94f54631deb377be10c86b661",
  "6bdfc28ae8effeaedc2fa18a98ac07d74013b6f0efce882631bdfdeb7bd9318d",
  "a0a5a753da489fa07e03ce41a1366a0e3ae062db8a45c616aa70daa0105cd394",
]);

export function buildManagedAppPortalSkill() {
  return `---
name: cu-app-portal
description: Use when working inside an app generated, imported, published, repaired, migrated, or managed by CU Launch.
---

# CU Launch

Use this skill when Codex is working inside a CU Launch-managed app repository.

## Required Context

1. Read \`app-portal/deployment-manifest.json\` before making publishing or Azure decisions when it exists. It may not exist yet during the first upload of a local app; in that case, use the compatibility and safe-migration workflow below until CU Launch adds the manifest.
2. Treat the CU Launch-managed GitHub repository as the supported source of truth.
3. Read \`docs/publishing/azure-app-service.md\` and \`docs/publishing/lessons-learned.md\` when publishing context matters.
4. Preserve local app code unless the user explicitly asks for app changes.

## CU Launch-First Workflows

- Prefer CU Launch for publishing setup, first publish, Repair Publishing Setup, collaborator access, GitHub access requests, push-to-deploy enablement, and scoped deletion.
- Use local \`git\` to connect this checkout to the CU Launch-managed GitHub repository. Pull CU Launch's initial guidance commit before changing or uploading the local app.
- Use \`gh\` and \`az\` for verification, diagnostics, or documented recovery after the CU Launch path is unavailable or blocked.
- Treat direct Azure CLI publishing as a recovery path, not the default path.

## App Compatibility and Safe Migration

Before uploading a local app to its CU Launch-managed repository:

1. Inspect the app's files, dependency definitions, build commands, start commands, and tests. Explain the app type you recognize in everyday language.
2. Match CU Launch's exact static-app rule. A root \`index.html\` alone is not enough. A plain static app is eligible only when it has a root \`index.html\` and no \`package.json\`, \`requirements.txt\`, or \`pyproject.toml\`.
3. If \`package.json\` exists but declares neither Next.js nor Express, and the repository is not a valid FastAPI app, treat the app as unsupported even when a root \`index.html\` exists. Vite, React build tooling, TypeScript compilation, and other frontend build systems do not qualify as plain static apps.
4. For an unsupported packaged frontend, inspect its scripts, dependencies, source files, and checked-in browser assets. If \`package.json\` is genuinely unused and the root HTML, JavaScript, and CSS run directly in a browser without building or generating files, explain the evidence and safely remove only the obsolete package tooling. If the package tooling is required, migrate the app to a supported root Next.js or Express app instead.
5. Do not create \`app-portal/http_server_start.py\` before CU Launch prepares the repository. CU Launch adds that Python runner after a plain static app passes compatibility; the runner's absence during the first upload is expected, and an existing copy can cause a publishing-file conflict.
6. For the other supported types, require a root Next.js app with a build script, an Express app with a start script, or Python FastAPI with a root \`main.py\` or \`app.py\` plus FastAPI, Gunicorn, and Uvicorn dependencies. Do not classify workspace roots as supported. Next.js and Express imports use npm; pnpm, Yarn, and Bun lockfiles are unsupported for those Node app types.
7. If it is already supported, preserve its framework and behavior. Do not migrate it merely to make it resemble a CU Launch starter.
8. If it is unsupported, evaluate the smallest safe migration to one supported app type. Choose the option most likely to preserve the app's user-visible behavior, data, routes, integrations, and existing tests with the fewest structural changes.
9. Explain the proposed migration and its visible impact in plain language before making it. If two reasonable migrations would change what the app can do, ask exactly one plain-language question and wait for the user's choice.
10. Keep a recoverable Git history. Do not delete the original implementation or discard existing commits to simplify a migration.
11. Use compatible system or bundled workspace runtimes to install dependencies and run the relevant build and tests. Do not upload a migration whose relevant tests fail.
12. After a successful migration and verification, commit and push the changed app to the CU Launch-managed repository. The user performs the next CU Launch confirmation.

## Human-Only CU Launch Boundary

- Never use Browser, Computer Use, Chrome, plugins, or connectors to open or operate CU Launch.
- Never sign in, navigate, click a CU Launch button, publish, repair, or confirm an upload for the user. CU Launch navigation and button clicks belong to the user.
- Tell the user the next CU Launch action in plain language, then stop and let the user perform it.
- A secure GitHub sign-in window opened by Git is allowed and is not CU Launch.

## Development and Test Runtimes

- Before reporting that Node.js, npm, pnpm, Python, or another required development or test runtime is unavailable, call \`load_workspace_dependencies\` when that capability is available.
- Prefer compatible bundled workspace runtimes and use the absolute executable paths it returns when system commands are missing.
- Check both system commands and bundled dependencies before saying tests cannot run.
- Do not install or download development runtimes merely because a system command is missing. This fallback does not replace the Cedarville-managed Git installation workflow.

## Local App Migration

When the app exists locally but is not yet CU Launch-managed:

1. Confirm that the user already created or registered the app through CU Launch.
2. Use the managed repository URL and git instructions shown by CU Launch.
3. Run \`git status\` before changing remotes.
4. Initialize Git only when the project is not already a Git repository.
5. Add the CU Launch-managed repository as a new remote without removing existing remotes.
6. Pull the managed repository's initial guidance commit and read this skill before changing the app. Preserve both histories when the local project already has commits.
7. Complete the compatibility check and any approved safe migration above, then run the relevant tests.
8. Push the verified current branch to the managed repository.
9. Tell the user that they can return to CU Launch themselves for scan, publishing setup, repair, or publish actions. Do not open or operate CU Launch.

## Existing GitHub App Migration

When the app is already on GitHub:

1. Use the CU Launch Add Existing App flow instead of manually copying CU Launch files.
2. Respect publishing file conflict warnings.
3. Prefer a CU Launch-generated review PR when publishing files already exist.
4. Do not overwrite an existing deployment workflow, deployment manifest, or app-local publishing docs without review.

## Guardrails

- Do not create unrelated Azure resources, GitHub repositories, GitHub Actions secrets, app registrations, or federated credentials outside the CU Launch-managed model unless the user explicitly asks for an unsupported recovery path.
- Do not weaken Cedarville Entra login, database, or App Service settings that the manifest marks as CU Launch-managed.
- Treat a request to limit the app audience as an authentication change. Use the CU Launch-managed Cedarville Microsoft Entra login screen and a verified Entra session before showing protected app content, then enforce the requested email, group, or role restriction server-side. Do not rely on a standalone allow list or client-side-only check. Keep only the exact public health endpoint plus the framework's required Entra sign-in and callback routes anonymous.
- Keep the exact \`GET /api/health\` endpoint public and returning HTTP 200 when the app process is healthy. Never protect, remove, rename, or make that endpoint depend on an allow list, session, database, or external service; CU Launch uses it to verify deployments.
- Record manual fixes, blockers, and recovery steps in \`docs/publishing/lessons-learned.md\`.
`;
}

export function isCanonicalManagedAppPortalSkill(
  content: string | undefined,
) {
  if (!content) {
    return false;
  }

  return (
    isCurrentManagedAppPortalSkill(content) ||
    PREVIOUS_MANAGED_APP_PORTAL_SKILL_HASHES.has(
      createHash("sha256").update(content).digest("hex"),
    )
  );
}

export function isCurrentManagedAppPortalSkill(content: string | undefined) {
  return content === buildManagedAppPortalSkill();
}

export function buildLegacyPublishToAzureStub() {
  return `---
name: publish-to-azure
description: Use when an older CU Launch-managed Cedarville app or prompt asks Codex to publish to Azure from this repository.
---

# Publish to Azure

Use the \`cu-app-portal\` skill for this CU Launch-managed app.

Direct Azure-first publishing is now a recovery path, not the default path for CU Launch-managed apps. Read \`app-portal/deployment-manifest.json\`, then prefer CU Launch for publishing setup, Repair Publishing Setup, first publish, push-to-deploy enablement, GitHub access, collaborator workflows, and scoped deletion.

Do not open or operate CU Launch through Browser, Computer Use, Chrome, plugins, or connectors. Tell the user what CU Launch action is available, then stop and let the user perform it.
`;
}
