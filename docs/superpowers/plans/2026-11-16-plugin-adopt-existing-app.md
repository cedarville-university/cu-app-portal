# Adopt Existing Apps Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adopt the current Codex project through CU Launch, including GitHub setup and approved compatibility migration.

**Architecture:** Extract import/preparation services with explicit actor identity; UI actions remain session adapters. Add strict MCP adapters, durable request-keyed creation, import diagnostics, and workspace instructions. Reuse compatibility, import runner, publishing preparation, and repository ownership markers.

**Tech Stack:** Next.js, TypeScript, Prisma, Zod, MCP, Vitest.

**Spec:** docs/superpowers/specs/2026-11-16-plugin-adopt-existing-app-design.md (approved November 16).

## Global Constraints

Preserve user work and plugin identity/audience. Architecture migration needs approval. Import never publishes. Keep authorization on replays, private-source limits, safe errors, and existing UI behavior.

## Review Focus

- Interrupted local provisioning resumes the saved request with its ownership marker.
- Same-org URLs cannot grant access without existing app authorization.
- Private source failures offer local upload without exposing provider details.
- PR preparation and merge verification remain distinct from publish readiness.
- Existing managed projects resume instead of producing duplicate app records.

### Task 1: Actor-scoped import services and recoverable creation

Files: repository-imports/actions.ts, service.ts, adoption.ts, queue-import.ts, adoption.test.ts.

- [x] Add failing tests for request-key replay, changed input, private/same-org denial, and local provision recovery.
- [x] Extract existing services from browser actions; preserve session-based UI adapters and revalidation.
- [x] Implement adoptExistingApp(actor, input), persisting a deterministic request ID and input digest before provider creation; use existing marked bootstrap for local apps. Queue external imports with the same saved identity and safely resend existing pending attempts on resume.
- [x] Run import action, queue, runner, and adoption tests.

### Task 2: MCP lifecycle and diagnostics

Files: portal-mcp/tools/adopt-existing-app.ts, imports.ts, server.ts, portal-api/rate-limit.ts, app-requests/get-app-summary.ts, portal-summary.ts and tests.

- [x] Test strict schemas, actor authorization before replay, preparation/verification, bounded compatibility findings, and no deployment on adoption.
- [x] Register adopt_existing_app, prepare_imported_app, verify_imported_app and get_app_import_status. Preparation uses shared actor services; status scans actual repository at a pinned head. Expose lifecycle actions and permit supported imported apps in existing access/publish tools.
- [x] Run MCP, summary, eligibility, and import checks.

### Task 3: Plugin adoption instructions and release verification

Files: plugin manifest/skill/metadata, README.md, docs/portal/codex-workspace-plugin.md, package/doc tests.

- [x] Update triggers and flow for existing projects, remote choice, local upload, compatibility/migration approval, invitations, source preservation, preparation reviews, and separately requested first publish.
- [x] Update metadata/version and tool inventory; document rate settings, durable replay, recovery limits, and release steps.
- [x] Run targeted tests, full test suite, release-note preview generation, production build, and diff review. Preserve unrelated release-note changes.

Execution: native implementation in the current checkout; no additional approval gate is needed for the approved design. Publication and live validation remain separate from source completion.

## Verification evidence (November 16, 2026)

- Full Vitest suite: 196 files passed; 1,735 tests passed, one skipped.
- Production build: passed.
- Standalone `tsc --noEmit --incremental false`: reports 262 existing test-fixture diagnostics, identical to a clean HEAD snapshot after normalizing file paths/line numbers; no added diagnostics.
- Release-note preview generator: ran successfully; retained the user's pre-existing generated preview changes.
- Independent implementation review: both reported issues fixed and re-reviewed; no remaining blockers.
- Skill scenario review: no remaining blockers for no-remote Vite, unreadable private source, declined monorepo migration, and PR merge verification. This was a dry run, not live host verification.
- No production resources, plugin audience, or workspace installation changed. Source verification preceded release authorization. The release commit includes: `Release-note: Add existing projects to CU Launch from Codex with guided GitHub setup and compatibility checks.`
