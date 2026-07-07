---
name: cu-app-portal
description: Use when modifying the Cedarville App Portal, its templates, imports, managed GitHub repository flow, Azure publishing setup, repair, downloads, collaboration, notifications, or generated app skills.
---

# CU App Portal

Use this skill when Codex is maintaining the Cedarville App Portal repository itself.

## Read First

Before substantial changes, read:

- `README.md`
- `docs/portal/setup.md`
- `docs/portal/template-authoring.md`
- `docs/portal/handoff-2026-04-23.md`
- `docs/superpowers/specs/2026-04-22-portal-v1-design.md`
- `docs/superpowers/plans/2026-04-22-portal-v1-implementation.md`

## Current Product Model

- The portal signs Cedarville users in with Microsoft Entra ID.
- Template-backed generation creates deterministic source snapshots and ZIP artifacts.
- Generated and imported apps use a portal-managed GitHub repository as the supported source of truth.
- Portal-managed Azure publishing uses shared Azure resource targets and per-app Web Apps.
- Repair Publishing Setup refreshes portal-managed secrets and federated credentials without deleting resources or dispatching deployments.
- Owners, collaborators, and admins have different permissions for downloads, GitHub access, publishing, repair, and deletion.

## Working Rules

- Preserve existing user changes and avoid unrelated refactors.
- Keep `/api/download/[requestId]` ownership-aware: unauthenticated users get `401`, foreign or missing artifacts get quiet `404`, valid owners get an attachment response and `ARTIFACT_DOWNLOADED`.
- Treat `E2E_AUTH_BYPASS=true` as test-only infrastructure.
- Prefer shared generation helpers over editing only one template asset.
- Keep generated app skill content aligned across generated templates and imported repositories.
- Update `README.md` and `docs/portal/` when setup, template authoring, auth, publishing, import, or local development behavior changes.

## Checks

- If template generation changes, run `npm test -- src/features/generation/build-archive.test.ts`.
- If imported app preparation changes, run `npm test -- src/features/repository-imports/publishing-bundle.test.ts src/features/repository-imports/compatibility.test.ts src/features/repository-imports/prepare-repository.test.ts`.
- If manifests or publishing setup change, run `npm test -- src/features/generation/deployment-manifest.test.ts src/features/publishing/setup/service.test.ts`.
- If auth, create, downloads, seeding, or E2E config changes, run the relevant targeted tests and `npm run build`.
