# Home page release notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the latest 20 dates of plain-language CU Launch changes in a scrollable section above the home page footer.

**Architecture:** A Node script collects first-parent Git commit trailers and a checked-in baseline into generated JSON before deployment builds. A server-rendered React component imports that JSON and renders dated notes without runtime Git or network access.

**Tech Stack:** Existing Node.js 24, Next.js, TypeScript, CSS, GitHub Actions, Vitest, and Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-28-home-whats-changed-design.md`

## Global Constraints

- Show the latest 20 dates containing release notes, newest first, in a vertically scrollable list.
- Use America/New_York calendar dates derived from commit timestamps.
- Collect only single-line `Release-note:` entries; omit unmarked commits and duplicate entries on the same date.
- Use first-parent history reachable from the deployment checkout.
- Preserve unrelated edits. No new dependency, service, database, or AI integration.
- Notes become visible with the corresponding successful application deployment.

## Review Focus

- A commit near UTC midnight must appear under its Eastern calendar date.
- A merged branch must not duplicate notes from both branch and merge history.
- A repository with no marked commits must still render the checked-in baseline.
- Missing or shallow Git history must fail generation rather than silently produce incomplete production notes.
- Keyboard users must be able to focus and scroll the named release-note region on narrow screens.

### Task 1: Generate release-note data

**Files:** Create `scripts/release-notes/generate.mjs`, `scripts/release-notes/generate.test.ts`, `src/features/release-notes/baseline.json`, and `src/features/release-notes/generated.json`.

**Interfaces:** Export `collectReleaseNotes(commits, baseline)` returning `{ date: string, notes: string[] }[]`; commits contain `{ timestamp: string, message: string }`. Export `readReleaseNoteCommits(cwd)` for first-parent history. The CLI writes the generated JSON to a fixed repository-relative destination. Importing the module does not run the CLI.

- [ ] Write tests asserting Eastern midnight/DST grouping, newest-first order, 20 distinct dates, multiple notes, ignored unmarked/empty entries, same-date deduplication, baseline fallback, and invalid input handling.
- [ ] Add temporary-repository tests asserting first-parent merge behavior and refusal of missing or shallow history.
- [ ] Run `npm test -- scripts/release-notes/generate.test.ts`; confirm expected failures before implementation.
- [ ] Implement generation using argument-array Git subprocess calls and structured record delimiters; do not interpolate commit messages into shell code. Verify baseline claims against current source and seed a few useful recent changes.
- [ ] Run the tests and CLI; inspect generated JSON for dates and plain-language content.
- [ ] Commit only the task files.

### Task 2: Render the home page section

**Files:** Create `src/features/release-notes/whats-changed.tsx` and `src/features/release-notes/whats-changed.test.tsx`; modify `src/app/page.tsx` and `src/app/globals.css`; create `src/app/page.test.tsx` if absent.

**Interfaces:** `WhatsChanged()` reads the generated `{ date, notes }[]` data. Render an h2, a named region with `tabIndex={0}`, semantic date headings and `<time dateTime>` elements, and note lists.

- [ ] Write tests asserting the section follows How it works, dates render in readable US English without timezone drift, notes are text, the scroll region is named/focusable, and an empty collection renders no empty section.
- [ ] Run the component/home tests and confirm expected failures.
- [ ] Implement the component and page insertion before the closing main element; add responsive max-height, overflow-y, and visible focus styles consistent with the portal.
- [ ] Run the tests and inspect desktop/narrow-screen rendering, including keyboard scrolling, when the local browser is available.
- [ ] Commit only the task files.

### Task 3: Connect deployment and document authoring

**Files:** Modify `.github/workflows/deploy-azure-app-service.yml`, `package.json`, and `AGENTS.md`; create `scripts/release-notes/workflow.test.ts` and `docs/portal/release-notes.md`; add a targeted README link without including unrelated edits.

**Interfaces:** `npm run release-notes:generate` invokes the generator. The deployment checkout uses `fetch-depth: 0`; generation runs before `npm run build`. Generated JSON is bundled through the component import.

- [ ] Write a YAML-based workflow test asserting full history checkout and generation before build, with unchanged main push/manual triggers and no write permission requirement.
- [ ] Run the workflow test and confirm expected failure.
- [ ] Add the command and workflow step. Document one-line trailer examples, skipped maintenance commits, squash/merge expectations, Eastern commit dates, 20-date limit, local regeneration, and successful-deployment visibility.
- [ ] Add contributor guidance requiring plain-language release notes for user-visible changes; avoid technical terms in visitor-facing text.
- [ ] Run all release-note/home tests and relevant existing workflow tests; then run `npm run build` and `git diff --check`.
- [ ] Review the complete scoped diff against the spec, fix any issues, and report local validation separately from commits, pushes, and deployment. Do not push or deploy without authorization.
- [ ] Commit only feature files, with `Release-note: See recent CU Launch improvements and fixes on the home page.` in the commit body.
