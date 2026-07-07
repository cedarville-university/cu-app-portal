# CU App Portal Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the outdated generated `publish-to-azure` skill with a portal-centered `cu-app-portal` skill for managed apps, plus a repo-local maintainer skill and legacy redirect.

**Architecture:** Add a shared `portal-skill.ts` generator that owns the managed-app skill path, legacy skill path, managed-app skill body, and compatibility stub. Wire generated templates, imported repository bundles, deployment manifests, and compatibility detection to those constants so the path migration has one source of truth. Keep a separate repo-local maintainer skill because generated app guidance and portal-maintenance guidance have different audiences.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Prisma-backed portal domain code, GitHub/Azure publishing bundle assets.

---

## Proposed File Structure

- Create: `src/features/generation/portal-skill.ts`
  Own generated managed-app skill constants and content builders.
- Create: `src/features/generation/portal-skill.test.ts`
  Unit-test skill paths, frontmatter, portal-first guidance, migration guidance, and legacy stub behavior.
- Modify: `src/features/generation/deployment-manifest.ts`
  Point `automation.skillPath` at `PORTAL_SKILL_PATH`.
- Modify: `src/features/generation/deployment-manifest.test.ts`
  Expect `.codex/skills/cu-app-portal/SKILL.md`.
- Modify: `src/features/generation/build-source-snapshot.ts`
  Emit managed-app `cu-app-portal` skill and legacy `publish-to-azure` stub from the shared helper.
- Modify: `src/features/generation/build-archive.test.ts`
  Update generated archive expectations for the new skill path and retained stub.
- Modify: `templates/web-app/template.json`
  Replace generated skill path entries with the new path and include the retained stub as a generated file.
- Modify: `templates/python-fastapi/template.json`
  Replace generated skill path entries with the new path and include the retained stub as a generated file.
- Keep: `templates/*/files/.codex/skills/publish-to-azure/SKILL.md.template`
  Leave these harmless because generated overrides skip them during archive output after template manifests change. Remove them only in a later cleanup.
- Modify: `src/features/repository-imports/compatibility.ts`
  Use exported portal skill path constants for publishing conflict detection.
- Modify: `src/features/repository-imports/compatibility.test.ts`
  Cover both new and legacy skill path conflicts.
- Modify: `src/features/repository-imports/publishing-bundle.ts`
  Emit the managed-app skill and legacy stub through the shared helper.
- Modify: `src/features/repository-imports/publishing-bundle.test.ts`
  Expect both emitted skill files and portal-first content for all supported import runtimes.
- Modify if needed: `src/features/repository-imports/prepare-repository.test.ts`
  Update object expectations only if exact file path sets fail after bundle tests pass.
- Create: `.codex/skills/cu-app-portal/SKILL.md`
  Repo-local portal-maintainer skill.
- Modify: `.codex/skills/publish-to-azure/SKILL.md`
  Replace old Azure-first instructions with a short redirect stub.
- Modify: `docs/portal/template-authoring.md`
  Update publishing bundle path references from the legacy skill path to the new skill path plus compatibility stub.

## Task 1: Add Shared Portal Skill Generator

**Files:**
- Create: `src/features/generation/portal-skill.test.ts`
- Create: `src/features/generation/portal-skill.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  LEGACY_PUBLISH_SKILL_PATH,
  PORTAL_SKILL_PATH,
  buildLegacyPublishToAzureStub,
  buildManagedAppPortalSkill,
} from "./portal-skill";

describe("portal skill generation", () => {
  it("uses stable generated skill paths", () => {
    expect(PORTAL_SKILL_PATH).toBe(".codex/skills/cu-app-portal/SKILL.md");
    expect(LEGACY_PUBLISH_SKILL_PATH).toBe(
      ".codex/skills/publish-to-azure/SKILL.md",
    );
  });

  it("builds a portal-first managed app skill", () => {
    const skill = buildManagedAppPortalSkill();

    expect(skill).toContain("name: cu-app-portal");
    expect(skill).toContain("app-portal/deployment-manifest.json");
    expect(skill).toContain("portal-managed GitHub repository");
    expect(skill).toContain("Prefer the Cedarville App Portal");
    expect(skill).toContain("Repair Publishing Setup");
    expect(skill).toContain("Add Existing App");
    expect(skill).toContain("Do not create unrelated Azure resources");
    expect(skill).toContain("direct Azure CLI publishing as a recovery path");
  });

  it("builds a legacy publish-to-azure stub that redirects to the portal skill", () => {
    const stub = buildLegacyPublishToAzureStub();

    expect(stub).toContain("name: publish-to-azure");
    expect(stub).toContain("Use the `cu-app-portal` skill");
    expect(stub).toContain("portal-managed app");
    expect(stub).toContain("not the default path");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- src/features/generation/portal-skill.test.ts
```

Expected: FAIL because `src/features/generation/portal-skill.ts` does not exist.

- [ ] **Step 3: Add the minimal shared generator**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
npm test -- src/features/generation/portal-skill.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/generation/portal-skill.ts src/features/generation/portal-skill.test.ts
git commit -m "feat: add portal managed app skill generator"
```

## Task 2: Point Deployment Manifests and Generated Archives at the New Skill

**Files:**
- Modify: `src/features/generation/deployment-manifest.ts`
- Modify: `src/features/generation/deployment-manifest.test.ts`
- Modify: `src/features/generation/build-source-snapshot.ts`
- Modify: `src/features/generation/build-archive.test.ts`
- Modify: `templates/web-app/template.json`
- Modify: `templates/python-fastapi/template.json`

- [ ] **Step 1: Write the failing manifest and archive expectations**

In `src/features/generation/deployment-manifest.test.ts`, change both exact expected manifest objects to:

```ts
automation: {
  skillPath: ".codex/skills/cu-app-portal/SKILL.md",
},
```

In `src/features/generation/build-archive.test.ts`, update generated archive assertions to include:

```ts
expect(zip.file(".codex/skills/cu-app-portal/SKILL.md")).toBeTruthy();
expect(zip.file(".codex/skills/publish-to-azure/SKILL.md")).toBeTruthy();
await expect(
  zip.file(".codex/skills/cu-app-portal/SKILL.md")?.async("string"),
).resolves.toContain("CU App Portal");
await expect(
  zip.file(".codex/skills/cu-app-portal/SKILL.md")?.async("string"),
).resolves.toContain("Repair Publishing Setup");
await expect(
  zip.file(".codex/skills/publish-to-azure/SKILL.md")?.async("string"),
).resolves.toContain("Use the `cu-app-portal` skill");
```

Replace old archive assertions that read `.codex/skills/publish-to-azure/SKILL.md` for database/auth-specific publish guidance with assertions against `.codex/skills/cu-app-portal/SKILL.md` for portal-first guidance.

Update template manifest expectations in the same test to expect:

```ts
expect(templateManifest.generatedFiles.sort()).toEqual([
  ".codex/skills/publish-to-azure/SKILL.md",
  "app-portal/deployment-manifest.json",
  "docs/deployment-guide.md",
  "docs/github-setup.md",
]);
expect(templateManifest.generatedOverrides?.sort()).toEqual([
  ".codex/skills/cu-app-portal/SKILL.md",
  ".env.example",
  "README.md",
  "docs/publishing/azure-app-service.md",
  "docs/publishing/lessons-learned.md",
  "package.json",
  "src/app/page.tsx",
  "src/lib/app-data.ts",
]);
expect(templateManifest.entryFiles).toEqual(
  expect.arrayContaining([
    ".codex/skills/cu-app-portal/SKILL.md.template",
  ]),
);
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/features/generation/deployment-manifest.test.ts src/features/generation/build-archive.test.ts
```

Expected: FAIL because the manifest and archives still use `.codex/skills/publish-to-azure/SKILL.md` as the primary skill path.

- [ ] **Step 3: Update manifest code and generated files**

In `src/features/generation/deployment-manifest.ts`, import the path constant and use it:

```ts
import { PORTAL_SKILL_PATH } from "./portal-skill";
```

Then change:

```ts
automation: {
  skillPath: PORTAL_SKILL_PATH,
},
```

In `src/features/generation/build-source-snapshot.ts`, import the helper:

```ts
import {
  LEGACY_PUBLISH_SKILL_PATH,
  PORTAL_SKILL_PATH,
  buildLegacyPublishToAzureStub,
  buildManagedAppPortalSkill,
} from "./portal-skill";
```

Then replace the generated skill entry in `buildGeneratedTemplateFiles` with:

```ts
[PORTAL_SKILL_PATH]: buildManagedAppPortalSkill(),
[LEGACY_PUBLISH_SKILL_PATH]: buildLegacyPublishToAzureStub(),
```

Keep `buildPublishSkillFile` in the file until no references remain, then remove the unused function and any now-unused local variables it carried.

- [ ] **Step 4: Update template manifests**

In `templates/web-app/template.json`, change the skill entry file from:

```json
".codex/skills/publish-to-azure/SKILL.md.template"
```

to:

```json
".codex/skills/cu-app-portal/SKILL.md.template"
```

Change generated files to include:

```json
".codex/skills/publish-to-azure/SKILL.md"
```

Change generated overrides to include:

```json
".codex/skills/cu-app-portal/SKILL.md"
```

and remove:

```json
".codex/skills/publish-to-azure/SKILL.md"
```

from generated overrides.

Apply the same path changes to `templates/python-fastapi/template.json`.

- [ ] **Step 5: Add inert template files for manifest validation**

Create these files if template manifest reads require them:

```text
templates/web-app/files/.codex/skills/cu-app-portal/SKILL.md.template
templates/python-fastapi/files/.codex/skills/cu-app-portal/SKILL.md.template
```

Each file can contain:

```markdown
Generated by portal code.
```

The generated override should replace this text in archive output.

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
npm test -- src/features/generation/portal-skill.test.ts src/features/generation/deployment-manifest.test.ts src/features/generation/build-archive.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/generation/deployment-manifest.ts src/features/generation/deployment-manifest.test.ts src/features/generation/build-source-snapshot.ts src/features/generation/build-archive.test.ts templates/web-app/template.json templates/python-fastapi/template.json templates/web-app/files/.codex/skills/cu-app-portal/SKILL.md.template templates/python-fastapi/files/.codex/skills/cu-app-portal/SKILL.md.template
git commit -m "feat: emit cu app portal skill in generated apps"
```

## Task 3: Update Imported Repository Publishing Bundles

**Files:**
- Modify: `src/features/repository-imports/compatibility.ts`
- Modify: `src/features/repository-imports/compatibility.test.ts`
- Modify: `src/features/repository-imports/publishing-bundle.ts`
- Modify: `src/features/repository-imports/publishing-bundle.test.ts`
- Modify if exact expectations fail: `src/features/repository-imports/prepare-repository.test.ts`

- [ ] **Step 1: Write failing import bundle expectations**

In `src/features/repository-imports/publishing-bundle.test.ts`, update the expected file list in the first test to:

```ts
expect(Object.keys(plan.filesToWrite)).toEqual([
  "package.json",
  ".github/workflows/deploy-azure-app-service.yml",
  ".codex/skills/cu-app-portal/SKILL.md",
  ".codex/skills/publish-to-azure/SKILL.md",
  "docs/publishing/azure-app-service.md",
  "docs/publishing/lessons-learned.md",
  "app-portal/deployment-manifest.json",
]);
```

Add assertions to the existing runtime-specific tests:

```ts
expect(plan.filesToWrite[".codex/skills/cu-app-portal/SKILL.md"]).toContain(
  "CU App Portal",
);
expect(plan.filesToWrite[".codex/skills/cu-app-portal/SKILL.md"]).toContain(
  "Add Existing App",
);
expect(
  plan.filesToWrite[".codex/skills/publish-to-azure/SKILL.md"],
).toContain("Use the `cu-app-portal` skill");
```

In `src/features/repository-imports/compatibility.test.ts`, add a conflict test:

```ts
it("records conflicts for the new and legacy portal skill paths", () => {
  const result = scanRepositoryCompatibility({
    "package.json": JSON.stringify({
      scripts: { build: "next build", start: "next start" },
      dependencies: { next: "15.5.15" },
      engines: { node: ">=24" },
    }),
    ".codex/skills/cu-app-portal/SKILL.md": "# Existing",
    ".codex/skills/publish-to-azure/SKILL.md": "# Existing legacy",
  });

  expect(result.status).toBe("CONFLICTED");
  expect(result.findings).toContainEqual({
    code: "FILE_CONFLICT",
    severity: "error",
    message:
      ".codex/skills/cu-app-portal/SKILL.md already exists and will not be overwritten.",
    path: ".codex/skills/cu-app-portal/SKILL.md",
  });
  expect(result.findings).toContainEqual({
    code: "FILE_CONFLICT",
    severity: "error",
    message:
      ".codex/skills/publish-to-azure/SKILL.md already exists and will not be overwritten.",
    path: ".codex/skills/publish-to-azure/SKILL.md",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/features/repository-imports/publishing-bundle.test.ts src/features/repository-imports/compatibility.test.ts
```

Expected: FAIL because imports still emit only the old one-line `publish-to-azure` skill and compatibility does not include the new path.

- [ ] **Step 3: Update compatibility path constants**

In `src/features/repository-imports/compatibility.ts`, import:

```ts
import {
  LEGACY_PUBLISH_SKILL_PATH,
  PORTAL_SKILL_PATH,
} from "@/features/generation/portal-skill";
```

Update `PUBLISHING_BUNDLE_PATHS` to:

```ts
export const PUBLISHING_BUNDLE_PATHS = [
  ".github/workflows/deploy-azure-app-service.yml",
  PORTAL_SKILL_PATH,
  LEGACY_PUBLISH_SKILL_PATH,
  "docs/publishing/azure-app-service.md",
  "docs/publishing/lessons-learned.md",
  "app-portal/deployment-manifest.json",
] as const;
```

- [ ] **Step 4: Update import publishing bundle output**

In `src/features/repository-imports/publishing-bundle.ts`, import:

```ts
import {
  LEGACY_PUBLISH_SKILL_PATH,
  PORTAL_SKILL_PATH,
  buildLegacyPublishToAzureStub,
  buildManagedAppPortalSkill,
} from "@/features/generation/portal-skill";
```

Replace:

```ts
filesToWrite[".codex/skills/publish-to-azure/SKILL.md"] =
  `# Publish to Azure\n\nUse the Cedarville App Portal as the supported Azure publishing path for this imported ${runtime.displayName} app.\n`;
```

with:

```ts
filesToWrite[PORTAL_SKILL_PATH] = buildManagedAppPortalSkill();
filesToWrite[LEGACY_PUBLISH_SKILL_PATH] = buildLegacyPublishToAzureStub();
```

- [ ] **Step 5: Update prepare repository tests if exact file maps fail**

If `src/features/repository-imports/prepare-repository.test.ts` fails because it expects an exact set of paths, add expectations for:

```ts
".codex/skills/cu-app-portal/SKILL.md"
".codex/skills/publish-to-azure/SKILL.md"
```

Keep existing assertions for workflow and manifest content.

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
npm test -- src/features/repository-imports/publishing-bundle.test.ts src/features/repository-imports/compatibility.test.ts src/features/repository-imports/prepare-repository.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/repository-imports/compatibility.ts src/features/repository-imports/compatibility.test.ts src/features/repository-imports/publishing-bundle.ts src/features/repository-imports/publishing-bundle.test.ts src/features/repository-imports/prepare-repository.test.ts
git commit -m "feat: use portal skill for imported app publishing"
```

## Task 4: Add Repo-Local Portal Maintainer Skill and Legacy Redirect

**Files:**
- Create: `.codex/skills/cu-app-portal/SKILL.md`
- Modify: `.codex/skills/publish-to-azure/SKILL.md`
- Modify: `docs/portal/template-authoring.md`

- [ ] **Step 1: Write the repo-local maintainer skill**

Create `.codex/skills/cu-app-portal/SKILL.md`:

```markdown
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
```

- [ ] **Step 2: Replace the repo-local legacy publish skill with a redirect**

Replace `.codex/skills/publish-to-azure/SKILL.md` with:

```markdown
---
name: publish-to-azure
description: Use when older Cedarville App Portal prompts or generated app repositories ask Codex to publish to Azure.
---

# Publish to Azure

Use the `cu-app-portal` skill first.

The Cedarville App Portal now treats portal-managed GitHub repositories and portal-managed Azure publishing as the supported path. Direct Azure-first publishing is a recovery path, not the default path. Read `app-portal/deployment-manifest.json` when working inside a managed app, and use portal publish or Repair Publishing Setup before falling back to manual `gh` or `az` operations.
```

- [ ] **Step 3: Update template authoring docs**

In `docs/portal/template-authoring.md`, update publishing bundle examples so they mention:

```markdown
- `.codex/skills/cu-app-portal/`
- `.codex/skills/publish-to-azure/` as a compatibility redirect
```

Also update the generated override example from:

```json
".codex/skills/publish-to-azure/SKILL.md"
```

to:

```json
".codex/skills/cu-app-portal/SKILL.md"
```

- [ ] **Step 4: Run a static check for legacy path wording**

Run:

```bash
rg -n "publish-to-azure|cu-app-portal" .codex docs/portal templates src/features/generation src/features/repository-imports
```

Expected: Output still includes the legacy path only for compatibility stubs, compatibility conflict detection, retained template files, or docs that explicitly describe the redirect.

- [ ] **Step 5: Commit**

```bash
git add .codex/skills/cu-app-portal/SKILL.md .codex/skills/publish-to-azure/SKILL.md docs/portal/template-authoring.md
git commit -m "docs: add portal maintainer skill"
```

## Task 5: Final Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run targeted test suites**

Run:

```bash
npm test -- src/features/generation/portal-skill.test.ts src/features/generation/build-archive.test.ts src/features/generation/deployment-manifest.test.ts src/features/repository-imports/publishing-bundle.test.ts src/features/repository-imports/compatibility.test.ts src/features/repository-imports/prepare-repository.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git status --short
git log --oneline -6
```

Expected: clean working tree, with implementation commits on top of the design commit.

- [ ] **Step 4: Commit any verification-only documentation adjustment**

If final verification exposes a doc wording mismatch, patch the affected doc and commit:

```bash
git add docs/portal/template-authoring.md
git commit -m "docs: clarify portal skill publishing guidance"
```

Skip this commit when no documentation adjustment is needed.
