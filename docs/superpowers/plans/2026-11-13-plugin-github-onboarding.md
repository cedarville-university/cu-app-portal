# Plugin GitHub Onboarding Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reuse or save the signed-in user's GitHub username and automate repository invitations with UI-equivalent local Git guidance.

**Architecture:** Add self-only profile services and two MCP adapters using the existing actor, rate limiter, audit log, and idempotency store. Update the workspace skill to coordinate profile, creation, and access as separate operations, then use the existing actor-specific access service to verify acceptance.

**Tech Stack:** TypeScript, Next.js, Prisma, Zod, MCP, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-plugin-github-onboarding-design.md`

## Global Constraints

- No database migration; reuse `User.githubUsername`.
- Preserve existing user edits, UI onboarding, app authorization, and grant ledger.
- No publishing or provider permission changes beyond the existing access service.
- Native execution in this checkout on `codex/plugin-github-onboarding`; leave changes available for review without pushing or deploying.

## Review Focus

- Target-user injection must fail before a profile read or write (Task 1).
- Invalid usernames and rate-limit failures must not write profile data (Task 1).
- Replaying an old save after a newer username must not undo the newer save (Task 1).
- Accepted invitations need a fresh provider check, not stale `get_app` state (Task 2).
- Repository setup must preserve local work and keep authentication separate from author identity (Task 2).

### Task 1: Self-profile services and MCP tools

**Files:** Create `src/features/portal-mcp/profile/service.ts`, `service.test.ts`, `tools.test.ts`, `schemas.ts`; create `tools/get-my-profile.ts` and `tools/set-my-github-username.ts`; modify `server.ts`, `server.test.ts`, `src/features/repositories/access.ts`, `src/features/portal-api/rate-limit.ts` and its test, and `.env.example`.

**Interfaces:** `getMyProfile(actor: PortalActor)` returns `{ displayName, email, githubUsername }`; `setMyGitHubUsername(actor: PortalActor, githubUsername: string)` returns `{ githubUsername }`. Tools are `get_my_profile({})` and `set_my_github_username({ githubUsername, idempotencyKey })`.

- [x] Write service and real-handler tests for self-only reads/writes, shared username validation, missing actor, safe output, strict schemas, read/write throttling, successful saved-profile readback, and stable replay including a subsequent profile change.
- [x] Run the new tests; confirm they fail because the feature does not exist.
- [x] Implement services, audit, adapters, registration, shared validation, and the dedicated 10/hour profile rate policy with a lower-only override.
- [x] Run profile, server, rate-limit, and idempotency tests; expect all passing.

### Task 2: Automatic invitations and local Git parity

**Files:** Modify the workspace `SKILL.md`, plugin manifest, `plugin-package.test.ts`, `server.ts`, and `server.test.ts`; add `profile/onboarding.test.ts`; extend `grant-repository-access.test.ts` as needed.

**Interfaces:** Task 1 tools supply the actor's identity. Existing `create_app`, `get_app`, and `request_github_access` remain separate operations with separate stable UUIDs.

- [x] Add failing package contracts for saved/missing username handling, inclusion of access in launch approval, automatic access after creation, invitation acceptance verification, and Git author/authentication parity.
- [x] Add integration coverage of saved and missing profiles through real registered handlers/services, including pending-to-granted access and access failure after successful creation; verify no duplicate creation and no publishing.
- [x] Update skill and server instructions, keeping the invitation acceptance check distinct from an uncertain-response replay. Bump package version to `1.0.3+codex.20261113`.
- [x] Run profile/onboarding, plugin-package, repository-access, and Codex handoff tests; expect all passing.

### Task 3: Documentation and final validation

**Files:** Modify `README.md`, `docs/portal/codex-workspace-plugin.md`, `docs/portal/setup.md`, and `docs.test.ts`.

**Interfaces:** Document the final seventeen-tool contract, profile write override, idempotency, invitation acceptance, and local Git guidance. No setup migration is required.

- [x] Update operator documentation and tests for the new self-profile contracts and refreshed plugin behavior.
- [x] Run all affected tests, `npm run release-notes:generate`, and `npm run build`. Preserve the pre-existing release-note preview edit if generation would overwrite it.
- [x] Review the final diff and request one independent code review. Fix material findings with targeted regression tests.
- [x] Record validation and distinguish local source changes from deployment/plugin refresh in the final response.

## Execution record

- Design approved by the user on November 13, 2026; user requested implementation.
- Working in the current checkout on a dedicated branch preserves the user's existing uncommitted work and keeps the result visible in their project.
- Task 1 complete: profile/schema/replay tests failed before implementation, then the profile/server/rate-limit/idempotency run passed 80 tests.
- Task 2 complete: package contracts failed before the skill update; integration regression exposed and fixed an old-identity access replay. The combined profile/server/package/access/handoff run passed 103 tests.
- Task 3 complete: final full Vitest run passed 1,656 tests across 190 files. Production build passed. Release-note generation matched the existing user-edited preview exactly. `git diff --check` passed.
- Independent review found no material issues; all four before/after pressure scenarios passed. Clarified the one documentation inconsistency it identified and verified it in the full suite.
- Standalone `tsc --noEmit` remains blocked by existing test-fixture typing errors; compared against an archived HEAD checkout with the same dependencies. New profile services, adapters, fixtures, and tests introduce no additional diagnostics. Documentation/package contract tests passed again after keeping new regular expressions compatible with the repository's ES2017 target.
- At the implementation handoff, no source commits, push, deployment, or installed-plugin refresh had been performed. The user subsequently authorized committing, pushing, deploying CU Launch, and refreshing the existing workspace plugin. Live GitHub invitation acceptance and actual host Git setup remain rollout verification.
