# Novice Codex and Git Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guide novice users through Cedarville-managed Git installation and a folder-bound local Codex project before Codex performs Git and GitHub work.

**Architecture:** Keep the existing onboarding state machine and repository flows. Strengthen the two prompt builders as the reusable behavioral contract, then render path-specific preparation checklists on the generated-customization and local-upload screens. Keep Markdown help as the source of truth for web help and downloadable PDFs.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Testing Library, Markdown, ReportLab/PyPDF

**Spec:** `docs/superpowers/specs/2026-08-20-novice-codex-git-onboarding-design.md`

## Global Constraints

- Git remains in the supported workflow and local history must be preserved.
- Windows users install Git from **Company Portal**; macOS users install it from **CedarNet 2.0**.
- Codex must never try to install Git or ask a novice to run terminal or Git commands.
- Users create or open a local Codex project before starting the task; Quick chat and standalone tasks are not supported for this handoff.
- GitHub authentication uses HTTPS and a secure browser or operating-system credential flow, never passwords, personal access tokens, SSH keys, GitHub CLI, or the GitHub plugin.
- Codex never opens or operates the Cedarville App Portal; it tells the user when a portal action is available and lets the user perform it.
- Codex checks compatible bundled workspace runtimes before declaring Node.js, Python, npm, pnpm, or tests unavailable. Git continues to use the Cedarville-managed installation path.
- A ready generated or imported repository leads to a question about what the user wants to change or build, not an assumed publishing step.
- Existing managed-repository, publishing, access-control, and recovery behavior must remain unchanged.

---

### Task 1: Prompt safety contract

**Files:**
- Modify: `src/features/repositories/codex-handoff.test.ts`
- Modify: `src/features/repositories/codex-handoff.ts`

**Interfaces:**
- Consumes: `buildCodexHandoffPrompt(...)` and `buildLocalCodexGitSetupPrompt(...)`
- Produces: beginner prompts that enforce the correct local project, managed Git installation handoff, HTTPS authentication, and safe stop conditions

- [x] **Step 1: Write failing prompt tests**

Add behavioral assertions for the local project prerequisite, `git --version`, Company Portal, CedarNet 2.0, stopping when Git is missing, HTTPS browser sign-in, and prohibited installer/plugin/CLI/password/token/SSH fallbacks.

- [x] **Step 2: Run the prompt tests and verify they fail for the missing safeguards**

Run: `npm test -- src/features/repositories/codex-handoff.test.ts`

Expected: FAIL because the current prompts tell Codex to install Git and do not require a local project.

- [x] **Step 3: Implement the prompt safeguards**

Add shared beginner safety and readiness instructions. Generated-app prompts verify an empty intended primary folder before cloning the managed repository into it. Local-app prompts verify the existing app folder and preserve existing history/remotes before connecting the managed repository.

- [x] **Step 4: Run the prompt tests and verify they pass**

Run: `npm test -- src/features/repositories/codex-handoff.test.ts`

Expected: PASS with no installer, plugin, credential, or project-context regressions.

### Task 2: Portal preparation checklist

**Files:**
- Modify: `src/app/onboarding/[requestId]/page.test.tsx`
- Modify: `src/app/onboarding/[requestId]/page.tsx`
- Create: `src/features/repositories/codex-preparation-checklist.tsx`
- Modify: `src/app/download/[requestId]/page.test.tsx`
- Modify: `src/app/download/[requestId]/page.tsx`

**Interfaces:**
- Consumes: generated customization and local upload/repair onboarding states
- Produces: visible, path-specific **Before opening Codex** instructions in the onboarding wizard and retained post-publication details screen

- [x] **Step 1: Write failing page tests**

Assert that generated apps tell users to create a new empty app folder and local apps tell users to select the existing app folder. Both paths must name Company Portal, CedarNet 2.0, reopening Codex, the local project and primary folder, and the prohibition on Quick chat or standalone tasks.

- [x] **Step 2: Run the page tests and verify they fail for missing guidance**

Run: `npm test -- src/app/onboarding/[requestId]/page.test.tsx`

Expected: FAIL because the existing screens only say to open Codex and paste the prompt.

- [x] **Step 3: Implement the reusable preparation checklist and path-specific copy**

Render the checklist before the prompt and on the retained app details screen. Explain Git, GitHub, and the local Codex project in everyday language, remove exposed broad staging commands from the local-app details, and keep existing confirmation and publish actions unchanged.

- [x] **Step 4: Run the page tests and verify they pass**

Run: `npm test -- src/app/onboarding/[requestId]/page.test.tsx`

Expected: PASS, including existing access, repair, preparation, setup, and publishing states.

### Task 3: Help and operator documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/portal/setup.md`
- Modify: `docs/user/quick-start.md`
- Modify: `docs/user/guide.md`
- Modify: `docs/user/troubleshooting.md`
- Modify: `docs/user/faq.md`
- Modify: `docs/user/glossary.md`
- Modify: `docs/readme.test.ts`
- Regenerate: `output/pdf/cedarville-app-portal-quick-start.pdf`
- Regenerate: `output/pdf/cedarville-app-portal-user-guide.pdf`
- Regenerate: `public/docs/cedarville-app-portal-quick-start.pdf`
- Regenerate: `public/docs/cedarville-app-portal-user-guide.pdf`

**Interfaces:**
- Consumes: the tested UI and prompt behavior from Tasks 1 and 2
- Produces: aligned web help, operator guidance, and downloadable PDFs

- [x] **Step 1: Write failing documentation-alignment tests**

Assert that the Quick Start, guide, troubleshooting, FAQ, and portal setup identify the managed installers and local-project-first workflow, and that the user-facing sources reject Quick chat for this handoff.

- [x] **Step 2: Run the documentation tests and verify they fail**

Run: `npm test -- docs/readme.test.ts`

Expected: FAIL because the current documentation does not include the approved managed-install and project-first instructions.

- [x] **Step 3: Update the documentation in plain language**

Define Git, GitHub, local Codex project, primary folder, and the secure browser sign-in handoff. Include exact Windows and macOS software-catalog names and troubleshooting for Git not being detected after installation.

- [x] **Step 4: Run the documentation tests and regenerate PDFs**

Run: `npm test -- docs/readme.test.ts src/features/help/docs.test.ts`

Run: `npm run docs:pdf`

Expected: documentation tests pass and all four PDF copies are regenerated from the updated Markdown.

### Task 4: Integrated verification

**Files:**
- Verify all files changed by Tasks 1-3

**Interfaces:**
- Consumes: completed prompt, UI, documentation, and PDF changes
- Produces: evidence that the feature is complete without unrelated regressions

- [x] **Step 1: Run focused tests**

Run: `npm test -- src/features/repositories/codex-handoff.test.ts src/app/onboarding/[requestId]/page.test.tsx docs/readme.test.ts src/features/help/docs.test.ts`

Expected: PASS.

- [x] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all test files and tests pass.

- [x] **Step 3: Run the production build**

Run: `npm run build`

Expected: Next.js completes successfully and reports all portal routes.

- [x] **Step 4: Inspect PDFs and repository hygiene**

Verify PDF page counts and text extraction, render representative pages for visual inspection, run `git diff --check`, and review `git status --short` plus the complete diff.

Expected: valid readable PDFs, no whitespace errors, and only intended files changed.
