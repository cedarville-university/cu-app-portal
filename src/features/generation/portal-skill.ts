export const PORTAL_SKILL_PATH = ".codex/skills/cu-app-portal/SKILL.md";
export const LEGACY_PUBLISH_SKILL_PATH =
  ".codex/skills/publish-to-azure/SKILL.md";

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
2. Determine whether it is already one of the portal-supported root app types: root Next.js, Express, Python FastAPI, or a plain static app with a root \`index.html\` that can run with Python \`http.server\`.
3. If it is already supported, preserve its framework and behavior. Do not migrate it merely to make it resemble a portal starter.
4. If it is unsupported, evaluate the smallest safe migration to one supported app type. Choose the option most likely to preserve the app's user-visible behavior, data, routes, integrations, and existing tests with the fewest structural changes.
5. Explain the proposed migration and its visible impact in plain language before making it. If two reasonable migrations would change what the app can do, ask exactly one plain-language question and wait for the user's choice.
6. Keep a recoverable Git history. Do not delete the original implementation or discard existing commits to simplify a migration.
7. Use compatible system or bundled workspace runtimes to install dependencies and run the relevant build and tests. Do not upload a migration whose relevant tests fail.
8. After a successful migration and verification, commit and push the changed app to the portal-managed repository. The user performs the next portal confirmation.

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
