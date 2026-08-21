import { createHash } from "node:crypto";

export const PORTAL_SKILL_PATH = ".codex/skills/cu-app-portal/SKILL.md";
export const LEGACY_PUBLISH_SKILL_PATH =
  ".codex/skills/publish-to-azure/SKILL.md";

const PREVIOUS_MANAGED_APP_PORTAL_SKILL_HASHES = new Set([
  "5ce4c7a302c86ecbdabda0ea68ed4dd763a741030ca7413686afa35e15998c28",
]);

export function buildManagedAppPortalSkill() {
  return `---
name: cu-app-portal
description: Use when working inside an app generated, imported, published, repaired, migrated, or managed by the Cedarville App Portal.
---

# CU App Portal

Use this skill when Codex is working inside a Cedarville App Portal-managed app repository.

## Required Context

1. Read \`app-portal/deployment-manifest.json\` before making publishing or Azure decisions when it exists. It may not exist yet during the first upload of a local app; in that case, use the compatibility and safe-migration workflow below until the portal adds the manifest.
2. Treat the portal-managed GitHub repository as the supported source of truth.
3. Read \`docs/publishing/azure-app-service.md\` and \`docs/publishing/lessons-learned.md\` when publishing context matters.
4. Preserve local app code unless the user explicitly asks for app changes.

## Portal-First Workflows

- Prefer the Cedarville App Portal for publishing setup, first publish, Repair Publishing Setup, collaborator access, GitHub access requests, push-to-deploy enablement, and scoped deletion.
- Use local \`git\` to connect this checkout to the portal-managed GitHub repository. Pull the portal's initial guidance commit before changing or uploading the local app.
- Use \`gh\` and \`az\` for verification, diagnostics, or documented recovery after the portal path is unavailable or blocked.
- Treat direct Azure CLI publishing as a recovery path, not the default path.

## App Compatibility and Safe Migration

Before uploading a local app to its portal-managed repository:

1. Inspect the app's files, dependency definitions, build commands, start commands, and tests. Explain the app type you recognize in everyday language.
2. Match the portal's exact static-app rule. A root \`index.html\` alone is not enough. A plain static app is eligible only when it has a root \`index.html\` and no \`package.json\`, \`requirements.txt\`, or \`pyproject.toml\`.
3. If \`package.json\` exists but declares neither Next.js nor Express, and the repository is not a valid FastAPI app, treat the app as unsupported even when a root \`index.html\` exists. Vite, React build tooling, TypeScript compilation, and other frontend build systems do not qualify as plain static apps.
4. For an unsupported packaged frontend, inspect its scripts, dependencies, source files, and checked-in browser assets. If \`package.json\` is genuinely unused and the root HTML, JavaScript, and CSS run directly in a browser without building or generating files, explain the evidence and safely remove only the obsolete package tooling. If the package tooling is required, migrate the app to a supported root Next.js or Express app instead.
5. Do not create \`app-portal/http_server_start.py\` before the portal prepares the repository. The portal adds that Python runner after a plain static app passes compatibility; the runner's absence during the first upload is expected, and an existing copy can cause a publishing-file conflict.
6. For the other supported types, require a root Next.js app with a build script, an Express app with a start script, or Python FastAPI with a root \`main.py\` or \`app.py\` plus FastAPI, Gunicorn, and Uvicorn dependencies. Do not classify workspace roots as supported. Next.js and Express imports use npm; pnpm, Yarn, and Bun lockfiles are unsupported for those Node app types.
7. If it is already supported, preserve its framework and behavior. Do not migrate it merely to make it resemble a portal starter.
8. If it is unsupported, evaluate the smallest safe migration to one supported app type. Choose the option most likely to preserve the app's user-visible behavior, data, routes, integrations, and existing tests with the fewest structural changes.
9. Explain the proposed migration and its visible impact in plain language before making it. If two reasonable migrations would change what the app can do, ask exactly one plain-language question and wait for the user's choice.
10. Keep a recoverable Git history. Do not delete the original implementation or discard existing commits to simplify a migration.
11. Use compatible system or bundled workspace runtimes to install dependencies and run the relevant build and tests. Do not upload a migration whose relevant tests fail.
12. After a successful migration and verification, commit and push the changed app to the portal-managed repository. The user performs the next portal confirmation.

## Human-Only Portal Boundary

- Never use Browser, Computer Use, Chrome, plugins, or connectors to open or operate the Cedarville App Portal.
- Never sign in, navigate, click a portal button, publish, repair, or confirm an upload for the user. Portal navigation and button clicks belong to the user.
- Tell the user the next portal action in plain language, then stop and let the user perform it.
- A secure GitHub sign-in window opened by Git is allowed and is not the Cedarville App Portal.

## Development and Test Runtimes

- Before reporting that Node.js, npm, pnpm, Python, or another required development or test runtime is unavailable, call \`load_workspace_dependencies\` when that capability is available.
- Prefer compatible bundled workspace runtimes and use the absolute executable paths it returns when system commands are missing.
- Check both system commands and bundled dependencies before saying tests cannot run.
- Do not install or download development runtimes merely because a system command is missing. This fallback does not replace the Cedarville-managed Git installation workflow.

## Local App Migration

When the app exists locally but is not yet portal-managed:

1. Confirm that the user already created or registered the app through the portal.
2. Use the managed repository URL and git instructions shown by the portal.
3. Run \`git status\` before changing remotes.
4. Initialize Git only when the project is not already a Git repository.
5. Add the portal-managed repository as a new remote without removing existing remotes.
6. Pull the managed repository's initial guidance commit and read this skill before changing the app. Preserve both histories when the local project already has commits.
7. Complete the compatibility check and any approved safe migration above, then run the relevant tests.
8. Push the verified current branch to the managed repository.
9. Tell the user that they can return to the portal themselves for scan, publishing setup, repair, or publish actions. Do not open or operate the portal.

## Existing GitHub App Migration

When the app is already on GitHub:

1. Use the portal Add Existing App flow instead of manually copying portal files.
2. Respect publishing file conflict warnings.
3. Prefer a portal-generated review PR when publishing files already exist.
4. Do not overwrite an existing deployment workflow, deployment manifest, or app-local publishing docs without review.

## Guardrails

- Do not create unrelated Azure resources, GitHub repositories, GitHub Actions secrets, app registrations, or federated credentials outside the portal-managed model unless the user explicitly asks for an unsupported recovery path.
- Do not weaken Cedarville Entra login, database, or App Service settings that the manifest marks as portal-managed.
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
description: Use when an older portal-managed Cedarville app or prompt asks Codex to publish to Azure from this repository.
---

# Publish to Azure

Use the \`cu-app-portal\` skill for this portal-managed app.

Direct Azure-first publishing is now a recovery path, not the default path for Cedarville App Portal-managed apps. Read \`app-portal/deployment-manifest.json\`, then prefer the Cedarville App Portal for publishing setup, Repair Publishing Setup, first publish, push-to-deploy enablement, GitHub access, collaborator workflows, and scoped deletion.

Do not open or operate the Cedarville App Portal through Browser, Computer Use, Chrome, plugins, or connectors. Tell the user what portal action is available, then stop and let the user perform it.
`;
}
