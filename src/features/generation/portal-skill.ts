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

1. Read \`app-portal/deployment-manifest.json\` before making publishing, repository, migration, or Azure decisions.
2. Treat the portal-managed GitHub repository as the supported source of truth.
3. Read \`docs/publishing/azure-app-service.md\` and \`docs/publishing/lessons-learned.md\` when publishing context matters.
4. Preserve local app code unless the user explicitly asks for app changes.

## Portal-First Workflows

- Prefer the Cedarville App Portal for publishing setup, first publish, Repair Publishing Setup, collaborator access, GitHub access requests, push-to-deploy enablement, and scoped deletion.
- Use local \`git\` to connect this checkout to the portal-managed GitHub repository when the portal created an empty managed repo.
- Use \`gh\` and \`az\` for verification, diagnostics, or documented recovery after the portal path is unavailable or blocked.
- Treat direct Azure CLI publishing as a recovery path, not the default path.

## Local App Migration

When the app exists locally but is not yet portal-managed:

1. Ask the user to create or register the app through the portal.
2. Use the managed repository URL and git instructions shown by the portal.
3. Run \`git status\` before changing remotes.
4. Initialize Git only when the project is not already a Git repository.
5. Add the portal-managed repository as a new remote without removing existing remotes.
6. Push the current branch to the managed repository.
7. Return to the portal for scan, publishing setup, repair, and publish actions.

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

export function buildLegacyPublishToAzureStub() {
  return `---
name: publish-to-azure
description: Use when an older portal-managed Cedarville app or prompt asks Codex to publish to Azure from this repository.
---

# Publish to Azure

Use the \`cu-app-portal\` skill for this portal-managed app.

Direct Azure-first publishing is now a recovery path, not the default path for Cedarville App Portal-managed apps. Read \`app-portal/deployment-manifest.json\`, then prefer the Cedarville App Portal for publishing setup, Repair Publishing Setup, first publish, push-to-deploy enablement, GitHub access, collaborator workflows, and scoped deletion.
`;
}
