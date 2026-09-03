# CU Launch Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand every external Cedarville App Portal experience as CU Launch with the approved navy-and-gold launch identity and `Launch New App` terminology, preserving internal identifiers and routes.

**Architecture:** A reusable brand lockup drives the shell and high-visibility views. A constrained copy audit updates end-user UI, generated user guidance, emails, and current docs; technical paths, request markers, and product behavior do not change.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS, Vitest, ReportLab/PyPDF

**Spec:** `docs/superpowers/specs/2026-09-02-cu-launch-rebrand-design.md`

## Global Constraints

- Official external product name: `CU Launch`.
- User-facing new-app action: `Launch New App`; preserve `/create` and all internal code paths.
- Palette: `#0B1D3A`, `#FFB300`, `#1D4ED8`, `#E6EAF0`, and `#FFFFFF`.
- Preserve internal package/schema names, request markers, routes, and `.codex/skills/cu-app-portal` paths.
- Preserve accessibility, responsive behavior, authentication, authorization, publishing, and generation behavior.
- Do not rewrite dated historical specs or plans.

---

### Task 1: Create the reusable CU Launch brand lockup

**Files:** Create `src/components/cu-launch-brand.tsx` and `src/components/cu-launch-brand.test.tsx`; modify `src/components/site-header.tsx`, `src/components/site-footer.tsx`, and `src/components/site-header.test.tsx`.

**Interface:** `CuLaunchBrand({ compact?: boolean; showTagline?: boolean }): JSX.Element`. Its inline SVG mark is `aria-hidden`; the visible text provides the accessible product name.

- [ ] Write the failing test:

```tsx
render(<CuLaunchBrand showTagline />);
expect(screen.getByText("CU Launch")).toBeVisible();
expect(screen.getByText("Launch your app. We handle the rest.")).toBeVisible();
expect(screen.getByTestId("cu-launch-mark")).toHaveAttribute("aria-hidden", "true");
```

- [ ] Run `npm test -- src/components/cu-launch-brand.test.tsx`; expect a missing-module failure.
- [ ] Implement a small inline-SVG gold triangle, white star, and orbit curve. Render `CU` and `Launch` in separate spans for navy/gold styling. Use compact mode in the header, full mode in the footer, and label the existing `/create` link `Launch New App`.
- [ ] Run `npm test -- src/components/cu-launch-brand.test.tsx src/components/site-header.test.tsx`; expect PASS.
- [ ] Commit: `git add src/components/cu-launch-brand.tsx src/components/cu-launch-brand.test.tsx src/components/site-header.tsx src/components/site-footer.tsx src/components/site-header.test.tsx && git commit -m "feat: add CU Launch brand lockup"`.

### Task 2: Apply the visual system to shell, home, and login

**Files:** Modify `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, and `src/app/login/page.tsx`; update `src/app/page.smoke.test.tsx` and `src/app/login/page.test.tsx`.

**Interface:** Consume `CuLaunchBrand`; emit CU Launch metadata/presentation without route or server-data changes.

- [ ] Write failing assertions:

```tsx
expect(screen.getByRole("heading", { name: "CU Launch" })).toBeVisible();
expect(screen.getByRole("link", { name: "Launch New App" })).toHaveAttribute("href", "/onboarding?start=new");
```

- [ ] Run `npm test -- src/app/page.smoke.test.tsx src/app/login/page.test.tsx`; expect old-copy failures.
- [ ] Load Montserrat with `next/font/google` for display text while retaining Inter for body text. Define approved `--launch-*` colors; update existing aliases, button/card/header/footer styles, responsive lockup behavior, and `:focus-visible`. Set metadata to CU Launch and apply the shared lockup to home/login.
- [ ] Run the same tests; expect PASS.
- [ ] Commit: `git add src/app/globals.css src/app/layout.tsx src/app/page.tsx src/app/login/page.tsx src/app/page.smoke.test.tsx src/app/login/page.test.tsx && git commit -m "feat: apply CU Launch visual system"`.

### Task 3: Reword all visible new-app screens without behavior changes

**Files:** Modify `src/app/create/page.tsx`, `src/app/create/[templateSlug]/page.tsx`, `src/app/apps/page.tsx`, `src/features/create-app/submit-button.tsx`, `src/app/help/[slug]/page.tsx`, and `src/app/settings/page.tsx`; update their existing page/form tests.

**Interface:** Every changed action preserves its existing `href` or form action. `SubmitButton` defaults to `Launch App`; explicit labels for other actions remain untouched.

- [ ] Write failing assertions:

```tsx
expect(screen.getByRole("heading", { name: "Launch New App" })).toBeVisible();
expect(within(breadcrumb).getByRole("link", { name: "Launch New App" })).toHaveAttribute("href", "/create");
expect(screen.getByRole("button", { name: "Launch App" })).toBeEnabled();
```

- [ ] Run `npm test -- src/app/create/page.test.tsx src/app/create/[templateSlug]/page.test.tsx src/app/apps/page.test.tsx src/features/create-app/template-form.test.tsx`; expect old-copy failures.
- [ ] Replace visible header, breadcrumb, navigation, empty-state, template-selection, and starter-submit labels with `Launch New App` or `Launch App`. Retain `Add Existing App`, `Publish to Azure`, and `Continue Setup`. Rebrand help metadata/settings copy, preserving all URLs and help slugs.
- [ ] Re-run the focused suite plus `src/app/settings/page.test.tsx`; expect PASS.
- [ ] Commit: `git add src/app/create src/app/apps/page.tsx src/app/help/[slug]/page.tsx src/app/settings/page.tsx src/features/create-app && git commit -m "feat: use CU Launch app terminology"`.

### Task 4: Rebrand external messages and generated user guidance

**Files:** Modify `src/features/notifications/templates.ts`, `src/features/collaboration-invites/actions.ts`, `src/features/repositories/codex-handoff.ts`, `src/features/generation/{portal-skill,build-source-snapshot}.ts`, and `src/features/repository-imports/{prepare-repository,publishing-bundle}.ts`; update matching tests.

**Interface:** Generated text says CU Launch. Keep `.codex/skills/cu-app-portal/SKILL.md` and `Cedarville App Portal request:<id>` as stable internal path/marker forms. Do not change provider, database, or authorization behavior.

- [ ] Write failing assertions that notification HTML, handoff prompts, skill headings, and publishing bundles contain `CU Launch`.
- [ ] Run `npm test -- src/features/notifications/templates.test.ts src/features/repositories/codex-handoff.test.ts src/features/generation/portal-skill.test.ts src/features/generation/build-source-snapshot.test.ts src/features/repository-imports/prepare-repository.test.ts src/features/repository-imports/publishing-bundle.test.ts`; expect old-copy failures.
- [ ] Replace only external/presentation text in emails, invitations, Codex handoffs, generated starter UI, generated skill prose, preparation PR copy, and publishing-bundle documentation.
- [ ] Re-run the focused suite; expect PASS.
- [ ] Commit: `git add src/features/notifications src/features/collaboration-invites/actions.ts src/features/repositories/codex-handoff.ts src/features/generation src/features/repository-imports && git commit -m "feat: rebrand external portal messages"`.

### Task 5: Rebrand current documentation and downloadable PDFs

**Files:** Modify `README.md`, `docs/portal/{setup,template-authoring,technical-operations,ui-rules}.md`, `docs/user/{README,quick-start,guide,faq,glossary,troubleshooting}.md`, `scripts/docs/build_pdfs.py`, and `src/app/help/page.tsx`; rename the two public PDFs to `cu-launch-quick-start.pdf` and `cu-launch-user-guide.pdf`; update documentation/help tests.

**Interface:** Markdown remains the help/PDF source. Download links point to new names; help slugs do not change.

- [ ] Write failing assertions that README contains `# CU Launch` and the Quick Start link targets `/docs/cu-launch-quick-start.pdf`.
- [ ] Run `npm test -- docs/readme.test.ts src/features/help/docs.test.ts src/app/help/page.test.tsx`; expect old-copy/file-name failures.
- [ ] Update current documentation names and creation terminology, refreshing edited user-doc `lastReviewed` to `2026-09-02`. Update the PDF renderer’s colors, title/footer, filenames, and extracted-text check to require CU Launch.
- [ ] Use the PDF skill workflow: run `npm run docs:pdf`, render both replacement PDFs, inspect title/footer/links/page breaks and the Quick Start one-page limit, then remove only the two named obsolete PDFs after replacements pass inspection.
- [ ] Re-run focused doc tests; expect PASS.
- [ ] Commit: `git add README.md docs/portal docs/user scripts/docs/build_pdfs.py src/app/help/page.tsx docs/readme.test.ts src/features/help/docs.test.ts src/app/help/page.test.tsx public/docs && git commit -m "docs: rebrand portal documentation as CU Launch"`.

### Task 6: Complete the external-copy audit and verification

**Files:** Modify only scan-identified external-copy tests/fixtures.

- [ ] Run `rg -n -i --glob '!**/*.test.*' --glob '!docs/superpowers/**' --glob '!**/*.pdf' 'CU App Portal|Cedarville App Portal|Create New App|Create App' README.md docs src public scripts`; expect no user-visible matches, except documented internal marker forms.
- [ ] Run `npm test`, `npm run build`, and `git diff --check`; expect all tests/build checks to pass and no whitespace errors.
- [ ] Review `git status --short` and `git log --oneline main..HEAD`; expect only approved rebrand changes on `codex/cu-launch-rebrand`.

## Spec Coverage Check

- Visual lockup and reference palette: Tasks 1–2.
- CU Launch and Launch New App on screens: Tasks 1–3.
- External messages and generated guidance: Task 4.
- Current documentation/PDFs: Task 5.
- Final copy scan and regression checks: Task 6.

## Placeholder and Consistency Check

- No implementation placeholders remain.
- Every copy change preserves its existing route, server action, or provider behavior.
