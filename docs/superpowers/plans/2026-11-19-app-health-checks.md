# App Health Checks Implementation Plan

> **For agentic workers:** Implement task-by-task using superpowers:executing-plans.

**Goal:** Check app health manually and on a schedule, recovering confirmed successful GitHub reruns without publishing.
**Architecture:** Shared service persists availability independently and conservatively reconciles failed attempts. Existing scheduled worker scans due apps.
**Tech Stack:** Next.js, TypeScript, Prisma, Vitest, Azure Container Apps Jobs.
**Spec:** docs/superpowers/specs/2026-11-19-app-health-checks-design.md

## Global Constraints

No deployment dispatch, queue messages, repairs, repository mutations, or restarts from health checks. Healthy apps are due every two hours; other apps every five minutes. Preserve active publishes and historical completion timestamps.

## Review Focus

- Stale network results must not overwrite newer publish or health observations.
- A healthy older app does not prove a failed deployment succeeded.
- Failed checks must advance the schedule so they cannot starve other apps.
- Probe URLs must come from managed Azure metadata, with redirects disabled.
- Deleted apps and never-provisioned apps must be skipped.

### Task 1: Persist and check app health

Files: prisma/schema.prisma; prisma/migrations/20261119180000_app_health_checks/migration.sql; src/features/publishing/app-health.ts; app-health.test.ts; src/lib/audit.ts.
Interface: checkAppHealth(requestId: string, actorUserId?: string), checkDueAppHealth().
- [x] Add failing tests for healthy verification, failure, rerun recovery, missing workflow evidence, active/newer publish, overlapping observations, unsafe URL, scheduling and failure isolation.
- [x] Run tests and confirm failure before implementation.
- [x] Implement schema, migration, bounded probes and guarded transactional persistence; use explicit provider reads only.
- [x] Run service tests and Prisma generation.

### Task 2: Expose authorized manual checks and scheduled scans

Files: src/features/publishing/health-actions.ts and test; src/features/app-details/app-health-panel.tsx and test; src/app/download/[requestId]/page.tsx; src/app/onboarding/[requestId]/page.tsx; src/workers/publish/main.ts and tests.
Interface: checkAppHealthAction(requestId: string): Promise<void>; AppHealthPanel receives saved health and deployment identity.
- [x] Write and run failing action/component tests for authorization, results, and no publish action invocation.
- [x] Implement shared panel in management and failed onboarding; integrate due scan in recovery and local worker.
- [x] Run action, component, existing page and worker tests.

### Task 3: Verify and document

Files: README.md; docs/portal/publishing-worker.md.
- [x] Document health behavior, adaptive cadence, migration and worker rollout.
- [x] Run targeted tests, production portal build and publishing-worker build; inspect diff for unrelated changes and concurrency gaps.
- [x] Report implemented behavior and distinguish local verification from live rollout.


## Verification record

- Service and UI tests were first run against missing implementation files and failed as expected, then passed after implementation.
- Full Vitest run: 216 files passed, one skipped; 1,907 tests passed and two skipped.
- `npm run build`, `npm run build:publish-worker`, `npx prisma validate`, and `git diff --check` passed.
- No live database migration, portal deployment, worker deployment or Arkanoid record correction was performed.
- The implementation uses a separate health-check version in addition to the observed app timestamp to fence simultaneous checks even within the same clock millisecond.
- Independent final review found no actionable issues in concurrency guards, recorded-run recovery, scheduling, authorization or probe behavior.
