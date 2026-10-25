# Unique App Names Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reject conflicting names for new template apps and provide timely, recoverable form feedback.

**Architecture:** Authenticated availability action and shared creation precheck compare all app names case-insensitively. A nullable unique appNameKey on newly generated apps prevents concurrent duplicate creation without backfilling old rows. React uses debounced and blur checks plus recoverable submission feedback.

**Tech Stack:** Next.js, React, Prisma/PostgreSQL, Vitest.

**Spec:** docs/superpowers/specs/2026-10-24-unique-app-names-design.md

## Global Constraints

- Uniqueness spans CU Launch and ignores capitalization and surrounding spaces.
- Existing records and existing-app import flows remain unchanged.
- Debounce 500 ms; check immediately on blur.
- Conflict copy: “That app name is already in use. Please try another name.”

## Review Focus

- Concurrent creation returns a safe conflict through unique-key handling.
- Older availability responses cannot overwrite feedback for a newer name.
- Lookup failures allow retry and cannot claim a name is available.
- Final submission conflict preserves other form fields.
- Availability queries require authentication and expose no app metadata.

### Task 1: Shared server constraint

Files: prisma/schema.prisma, new migration, src/features/app-requests/app-name.ts, create-generated-app.ts and tests, src/app/create/name-availability-action.ts and test, actions.ts and test.

Interfaces: checkAppNameAvailability(name: string) returns Promise<boolean>; APP_NAME_CONFLICT_MESSAGE; createAppAction(formData) returns safe conflict state or redirects.

- [x] Write and run failing tests for duplicate precheck, unique-key races, unrelated database errors, authenticated lookup, and recoverable submit conflict.
- [x] Add nullable unique appNameKey without backfill. Compare the trimmed input against all existing trimmed names with Prisma insensitive matching. Populate the key only in generated creation. Translate only appNameKey unique violations into CONFLICT.
- [x] Run relevant Vitest tests and Prisma generation/validation.

### Task 2: Interactive form

Files: new app-name-field.tsx and tests; template-form.tsx, template-form-fields.tsx and tests.

Interfaces: AppNameField renders appName with accessible async feedback; TemplateForm handles final submission feedback.

- [x] Write failing tests for debounce, blur, conflicts, edits, stale responses, lookup failure/retry, and submission errors.
- [x] Implement checks with request-version tracking and input validity. Submit through a transition and preserve native form values when returning final conflict feedback.
- [x] Run related UI tests, full Vitest suite, and production build.
- [x] Review diff and record validation outcomes.

## Validation

- Shared service and UI regression tests ran red before implementation and green afterward.
- Full Vitest suite: 167 files, 1,418 tests passing.
- Targeted browser tests: conflict after pause/blur, correction, literal percent character, and direct Launch click from focused name field pass.
- Full browser suite: 3 pass; 2 unrelated existing navigation expectations fail (`routes new and existing apps to the intended beginner forms`, `resumes unpublished setup and reserves full management for published apps`).
- Prisma schema validates; all migrations deploy to disposable PostgreSQL. Real concurrent inserts yield one success and one appNameKey unique conflict, while duplicate legacy names with null keys remain permitted.
- Production build passes. Independent review found the blur submission issue, fixed with unit and browser regression coverage; no other important defects reported.
