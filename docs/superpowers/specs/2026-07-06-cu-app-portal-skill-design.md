# CU App Portal Skill Design

## Overview

Create a new Codex skill family for apps managed by the Cedarville App Portal and for agents maintaining the portal itself.

The current embedded `publish-to-azure` skill is outdated because it frames Azure publishing as a repo-local Codex workflow. The portal now manages app ownership, GitHub repository setup, Azure publishing setup, repair, collaboration, and scoped deletion. Future generated and imported app repositories should tell Codex to work through the portal first, using local Git, GitHub, and Azure commands as diagnostics or recovery paths rather than the default publishing path.

## Goals

- Replace the old generated-app `publish-to-azure` guidance with a `cu-app-portal` skill for portal-managed apps.
- Add a portal-maintainer `cu-app-portal` skill in this repository for future Codex work on the portal product.
- Preserve a short `publish-to-azure` compatibility stub so older prompts still route toward the new portal workflow.
- Keep generated templates and imported repositories aligned by sharing the managed-app skill content from one generator.
- Teach Codex how to migrate existing or local apps into the portal without overwriting app code or bypassing portal ownership.

## Non-Goals

- Building a browser automation client for the portal UI.
- Adding a new backend API for Codex to call the portal directly.
- Replacing the existing portal-managed publishing implementation.
- Removing the GitHub Actions workflow or deployment manifest from managed app repositories.
- Supporting non-portal Azure publishing as the primary happy path.

## Skill Variants

### Managed-App Skill

Path in generated and imported app repositories:

```text
.codex/skills/cu-app-portal/SKILL.md
```

This skill is for Codex sessions opened inside an app that is managed by the Cedarville App Portal. It should instruct Codex to:

- Read `app-portal/deployment-manifest.json` before making publishing or migration decisions.
- Treat the portal-managed GitHub repository as the supported source of truth.
- Prefer the portal for publishing setup, repair, first publish, push-to-deploy enablement, access requests, collaborator workflows, and deletion decisions.
- Use `docs/publishing/azure-app-service.md` and `docs/publishing/lessons-learned.md` for app-local operational context.
- Use local `git` commands to connect a local project to the managed repository when the portal created an empty repo.
- Use `gh` and `az` commands only for verification, diagnostics, or documented recovery after confirming the portal path is unavailable or blocked.
- Avoid creating unrelated Azure resources, new GitHub repositories, or app registrations outside the portal-managed model unless the user explicitly asks for an unsupported recovery path.

The managed-app skill should be runtime-aware enough to reflect the generated or imported app's manifest: Next.js, Express, FastAPI, and static `http.server` apps can all use the same skill text, with runtime specifics discovered from the manifest.

### Portal-Maintainer Skill

Path in this portal repository:

```text
.codex/skills/cu-app-portal/SKILL.md
```

This skill is for Codex sessions modifying the Cedarville App Portal codebase. It should instruct Codex to:

- Read the repo orientation docs before substantial changes.
- Understand the current portal model: template-backed generation, source snapshots, imported repositories, managed GitHub repositories, portal-managed Azure publishing, repair, collaboration, notifications, and scoped deletion.
- Keep ownership-aware download behavior and quiet `404` behavior for foreign app requests.
- Preserve the test-only E2E auth bypass as test infrastructure only.
- Update docs when setup, templates, auth, publishing, imports, or local development behavior changes.
- Rerun targeted Vitest suites and `npm run build` before claiming success when touching high-risk areas.
- Prefer updating shared generation helpers over editing only static template skill files.

The portal-maintainer skill should not be bundled into generated apps. Its language can mention internal source files and repo-specific checks because it is only for this repository.

### Compatibility Stub

Path retained in this portal repository and optionally emitted in managed app repositories:

```text
.codex/skills/publish-to-azure/SKILL.md
```

The stub should remain short. It should trigger for existing "publish to Azure" phrasing and immediately redirect Codex to the `cu-app-portal` workflow. It should say that direct Azure-first publishing is now a recovery path, not the default path for portal-managed Cedarville apps.

## Generated Content Architecture

Introduce a shared helper for managed-app skill content so generated templates and imported repositories emit the same guidance.

Suggested source boundary:

```text
src/features/generation/portal-skill.ts
```

This helper should export:

- `PORTAL_SKILL_PATH = ".codex/skills/cu-app-portal/SKILL.md"`
- `LEGACY_PUBLISH_SKILL_PATH = ".codex/skills/publish-to-azure/SKILL.md"`
- `buildManagedAppPortalSkill()`
- `buildLegacyPublishToAzureStub()`

The generator should use these constants in:

- source snapshot generation for generated templates
- repository import publishing bundle planning
- deployment manifest automation metadata
- compatibility path conflict detection
- tests that assert generated archive and import output paths

Keeping the generated skill body centralized prevents the FastAPI, Next.js, Express, and static import paths from drifting.

## Migration Behavior

For a local app not yet on GitHub, the skill should guide Codex to:

1. Ask the user to create or register the app through the portal when that has not happened yet.
2. Use the portal-provided managed repository URL and plain Git instructions.
3. Initialize Git locally only if the project is not already a Git repository.
4. Add the managed repository as a remote without removing existing remotes.
5. Push the current branch to the managed repository.
6. Return to the portal for scan, publishing setup, repair, and publish actions.

For an existing GitHub app, the skill should guide Codex to:

1. Use the portal add-existing-app flow rather than manually copying portal files.
2. Respect publishing file conflict warnings.
3. Prefer a portal-generated review PR when publishing files already exist.
4. Avoid overwriting an existing deployment workflow, manifest, or app-local publishing docs without review.

## Testing Strategy

Update tests before implementation so the path migration is intentional:

- Generated archive tests should expect `.codex/skills/cu-app-portal/SKILL.md` and the compatibility stub if retained in generated apps.
- Repository import bundle tests should expect the same managed-app skill content path for all supported runtimes.
- Manifest tests should expect `automation.skillPath` to point at `.codex/skills/cu-app-portal/SKILL.md`.
- Template manifest tests should expect generated overrides and entry files to use the new path.
- Compatibility tests should treat both the new skill path and legacy stub path as portal-owned publishing paths when conflict detection applies.

Targeted verification after implementation:

```bash
npm test -- src/features/generation/build-archive.test.ts src/features/repository-imports/publishing-bundle.test.ts src/features/generation/deployment-manifest.test.ts src/features/repository-imports/compatibility.test.ts
npm run build
```

Run broader checks if implementation touches create actions, publishing setup, auth, download routes, or E2E configuration.

## Rollout

1. Add the portal-maintainer `cu-app-portal` skill to this repository.
2. Add the shared managed-app skill content helper.
3. Point generated templates, imports, manifests, and tests to `.codex/skills/cu-app-portal/SKILL.md`.
4. Replace the repo-local `publish-to-azure` skill with a compatibility stub.
5. Optionally emit the compatibility stub in generated and imported app repositories during a transition period.
6. Update template authoring docs if the generated publishing bundle path list changes.

The implementation should favor compatibility during the transition. Keeping a small legacy stub avoids surprising agents or users who still ask Codex to "publish to Azure."
