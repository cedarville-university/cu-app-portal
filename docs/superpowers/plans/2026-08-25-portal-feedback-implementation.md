# Portal Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make app audience explicit and enforce it in generated apps while simplifying the portal workflow, management screen, and help content.

**Architecture:** The existing `entraLogin` generation input remains the stored implementation flag, but the create form presents it as a required audience choice. Generated Next.js and FastAPI sources add server-side access control only when Cedarville sign-in is chosen. Portal UI changes stay presentation-only, with reusable components for the audience control and app readiness summary.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Playwright, Auth.js, FastAPI source generation.

**Spec:** User-approved numbered feedback plan in this task; items 5 and 9 are explicitly excluded.

## Global Constraints

- Do not require, install, or automate the GitHub plugin.
- The user must explicitly choose either Cedarville sign-in or an openly public app before creation.
- The openly public choice must require an acknowledgement that the published address is accessible on the internet.
- Do not add template complexity labels.
- Do not create a video or modify the Codex handoff review workflow.
- Keep E2E auth bypass test-only.

---

### Task 1: Audience selection and generated-app enforcement

**Files:**
- Create: `src/features/create-app/audience-field.tsx`
- Modify: `src/features/create-app/template-form-fields.tsx`
- Modify: `src/features/create-app/validation.ts`
- Modify: `src/features/templates/catalog.ts`
- Modify: `src/features/generation/build-source-snapshot.ts`
- Modify: `src/features/generation/python-fastapi-source.ts`
- Test: `src/features/create-app/template-form-fields.test.tsx`
- Test: `src/features/create-app/validation.test.ts`
- Test: `src/features/generation/build-source-snapshot.test.ts`
- Test: `src/features/generation/python-fastapi-source.test.ts`

- [ ] Add failing tests for the required audience choice, public acknowledgement, generated Next middleware, and FastAPI request gate.
- [ ] Run only those tests and confirm they fail because the behavior is absent.
- [ ] Implement the audience field, validation, and conditional generated source protection.
- [ ] Run the same tests and confirm they pass.

### Task 2: Plain-language creation and onboarding flow

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/create/page.tsx`
- Modify: `src/app/create/[templateSlug]/page.tsx`
- Modify: `src/features/onboarding/step-shell.tsx`
- Modify: `src/app/onboarding/[requestId]/page.tsx`
- Test: `src/app/page.smoke.test.tsx`
- Test: `src/app/create/page.test.tsx`
- Test: `src/app/create/[templateSlug]/page.test.tsx`
- Test: `src/features/onboarding/step-shell.test.tsx`
- Test: `src/app/onboarding/[requestId]/page.test.tsx`

- [ ] Add failing expectations for user-facing language, no runtime labels, `Develop` progress, and the account-creation primary choice.
- [ ] Run the affected tests and confirm they fail.
- [ ] Update only copy and rendered labels; preserve the existing starter-versus-customize workflow.
- [ ] Run the affected tests and confirm they pass.

### Task 3: Publish success and app-details information architecture

**Files:**
- Create: `src/features/app-details/app-readiness-checklist.tsx`
- Modify: `src/app/onboarding/[requestId]/page.tsx`
- Modify: `src/app/download/[requestId]/page.tsx`
- Modify: `src/features/public-apps/public-listing-panel.tsx`
- Test: `src/features/app-details/app-readiness-checklist.test.tsx`
- Test: `src/app/onboarding/[requestId]/page.test.tsx`
- Test: `src/app/download/[requestId]/page.test.tsx`
- Test: `src/features/public-apps/public-listing-panel.test.tsx`

- [ ] Add failing tests for a direct published-app link, readiness checklist, advanced-options disclosure, and clear portal-sharing language.
- [ ] Run the affected tests and confirm they fail.
- [ ] Implement the reusable readiness component and move secondary configuration/details behind a native disclosure without hiding primary publish actions.
- [ ] Run the affected tests and confirm they pass.

### Task 4: Help and acceptance coverage

**Files:**
- Modify: `docs/user/guide.md`
- Modify: `docs/user/quick-start.md`
- Modify: `docs/user/faq.md`
- Modify: `docs/user/glossary.md`
- Modify: `docs/user/troubleshooting.md`
- Test: `src/features/help/docs.test.ts`
- Test: `e2e/onboarding.spec.ts`

- [ ] Add failing documentation/rendering and E2E expectations for audience choice, permission guidance, public-app warning, and the revised success flow.
- [ ] Run the focused tests and confirm they fail.
- [ ] Update the user documentation in plain language and extend E2E coverage without adding a video or plugin instructions.
- [ ] Run the focused tests and confirm they pass.

### Task 5: Full verification and handoff

**Files:**
- Verify: changed source, tests, docs, and generated outputs

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run the relevant Playwright onboarding coverage.
- [ ] Run `git diff --check` and inspect the changed-file list.
- [ ] Commit the scoped changes on `codex/portal-feedback`.
