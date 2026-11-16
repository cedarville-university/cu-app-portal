# Imported Login Review Implementation Plan

> **For agentic workers:** Use native execution for this approved change and request an independent code review before completion.

**Goal:** Prevent imported apps from silently keeping the warning-prone default sign-in flow.

**Architecture:** Keep generated-app notice eligibility based on starter version and show imported Next.js/Express sign-in guidance regardless of creation date. Return shared, self-contained login requirements and recovery prompts through import tools. Add an actor-confirmed source review, bound to the managed repository and commit, and enforce it before an imported sign-in app's first publish. Static findings inform the reviewer; neither a filename nor a confirmation certifies live authentication or Google's classification.

**Tech Stack:** Next.js, TypeScript, Prisma's existing append-only audit records, Zod, MCP, Vitest.

**Spec:** The user's November 16 request to implement all three recommendations in this chat.

## Global Constraints

- Preserve unrelated changes, plugin identity/audience, application frameworks, existing callbacks, and explicit publishing authorization.
- No automatic changes to imported application authentication code and no production publication in this task.
- Public apps do not need login review. Updated generated starters do not receive the upgrade notice.
- Review checks require actual source files, explicit confirmation of code/test review, current authorization, and the current remote commit. Unknown and unavailable results remain actionable.
- First-publish review applies to imported sign-in apps; already published apps keep their existing deployment behavior.
- Record review evidence in a dedicated audit event; no database migration is needed. Dismissal never records a review.

## Review Focus

- Recent imports must receive guidance, and blocked browser storage must not break it.
- An absent or customized app-local skill must not hide the requirements.
- A new remote commit, mismatched repository, or lost app authorization must prevent use of an old review.
- Source comments, provider errors, secrets, and arbitrary repository text must never be returned as trusted instructions.
- Queued work must not deploy an unreviewed commit after the remote changes.

### Task 1: Notice eligibility and shared import guidance

- [x] Add failing cases for recent imported Next.js/Express apps and recent generated old/updated starter versions on both details routes.
- [x] Remove creation-time eligibility; retain framework, audience, and generated template-version checks.
- [x] Add one shared import login guidance builder with framework-specific requirements and recovery prompt. Include it in adoption and status responses, including pending preparation and missing-skill cases.
- [x] Run notice, handoff, import status, and tool response tests.

### Task 2: Source review and first-publish enforcement

- [x] Test fixed findings from real source fixtures, empty/custom login pages, source-file selection limits, denied access, current versus stale SHA, changed repository, failed persistence, and public/published exclusions.
- [x] Implement a bounded pinned-commit source inspection and actor-confirmed review service. Persist only fixed-schema metadata, reviewed source paths, actor, repository identity, and commit in `IMPORTED_LOGIN_REVIEWED` audit events.
- [x] Expose the source findings and review state in import status; add a strict actor-authorized `review_imported_app_login` tool and a portal confirmation form after Codex review.
- [x] Enforce current review in shared UI/MCP first-publish queueing and immediately before worker dispatch. Pin the first deployment's checkout to the reviewed SHA; retain existing push behavior after first publish.
- [x] Test unknown/unavailable states and ensure no queue or workflow dispatch occurs on missing/stale review.

### Task 3: Plugin instructions, docs, and verification

- [x] Teach the workspace plugin to consume the returned requirements, inspect/test login, record review at the returned current commit, and re-review after code changes. Preserve migration and publishing approvals.
- [x] Update plugin version, tool inventories, portal docs, and a user-facing release-note trailer for a future commit.
- [x] Run affected suites, full tests, production build, worker build, and diff checks. Preserve existing release-note preview edits.
- [x] Request independent review, address findings, and report source completion separately from deployment/plugin installation.

Suggested future commit trailer: `Release-note: Imported apps now include sign-in guidance and a review before their first publish.`

## Verification (November 16, 2026)

- Full suite: 201 test files passed; 1,795 tests passed and one existing test skipped.
- Portal production build and publishing-worker build passed; built-worker import smoke passed.
- Publish-worker runtime lockfile validated offline. YAML is an explicit locked runtime dependency and stays external to the ESM bundle to avoid CommonJS dynamic-require startup failures.
- Independent read-only review accepted the final implementation with no remaining blockers. Review findings led to staged imported workflows, YAML-preserving trigger updates, parsed checkout validation, supported COMMITTED-to-PR preparation refresh, dynamic-auth/manual review support, editable source paths and checked commit, CRLF normalization, legacy success-history handling, and durable recovery warnings.
- The release-note preview generator ran; the pre-existing preview changes were restored byte-for-byte. Unrelated `.impeccable/` content was preserved.
- No commit, push, production deployment, plugin publication/installation, live Entra login test, or browser-classification verification was performed.
