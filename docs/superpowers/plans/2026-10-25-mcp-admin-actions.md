# MCP Administrative Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make MCP My Apps owner-only and add authorized app listing, diagnostics, user lookup, and GitHub/Azure log retrieval.

**Architecture:** Keep the existing authenticated MCP endpoint. Separate owner-only queries from admin services, and use dedicated bounded log readers with server-resolved targets and shared response/redaction helpers. Wire the services through the existing injectable MCP dependencies.

**Tech Stack:** Next.js, TypeScript, Prisma, Zod, MCP SDK/mcp-handler, fetch/Web Streams, existing GitHub App credentials and Azure DefaultAzureCredential, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-mcp-admin-actions-design.md`

## Global Constraints

- Owner listing uses `AppRequest.userId === actor.userId` for everyone.
- All four admin tools require the server-resolved portal `ADMIN` role; handlers and services enforce it before administrative reads.
- Admin tools use strict schemas and the existing safe result/error envelope and shared read rate limit.
- Queries default to 25 rows and cap at 100; use deterministic ordering and an extra row for `nextOffset`.
- Diagnostics use allowlisted fields, ten recent attempts, and sanitized messages; never return worker tokens, environment values, arbitrary metadata, submitted config, or credentials.
- Logs default to both providers, both Azure log categories, and 200 lines; maximum 1,000 lines per log, five GitHub jobs, 64 KiB returned text, 5 MiB per upstream response, and 10 MiB downloaded per call.
- Provider requests time out after 10 seconds and the operation after 30 seconds; enforce download bounds while reading.
- Use stored managed resource identities only; no caller URLs, paths, repository targets, subscriptions, role flags, or credentials.
- No repair, restart, retry, deployment, logging configuration change, new delegated scope, or schema migration.
- Local validation does not establish deployed provider access or plugin publication.
- Preserve unrelated changes. Commit only reviewed task files if the execution workflow calls for commits; do not push, deploy, or publish as part of this implementation.

## Review Focus

- Changed/revoked roles: the next authenticated call must deny all admin actions, including cursor continuation (Tasks 2 and 5).
- A log download redirects off GitHub: validate HTTPS destination and never forward authorization (Task 3).
- A provider stalls, returns oversized content, or floods pagination: cancel within budgets and preserve other sources (Tasks 3 and 4).
- A cursor names another app/attempt or the latest run changes: reject target mismatches and retain the selected attempt (Task 4).
- Logs contain secrets, Unicode, or instructions: redact before return, enforce byte limits on UTF-8 text, and treat content as evidence (Tasks 2, 3, and 5).

## Task 1: Owner-only app listing

**Files:** Modify `src/features/app-requests/list-accessible-apps.ts`, its test, `src/features/portal-mcp/tools/list-my-apps.ts`, and `src/features/portal-mcp/server.ts` and its test. Rename the listing file and export to `list-owned-apps.ts` / `listOwnedAppSummaries` and update all references.

**Interfaces:** `listOwnedAppSummaries(actor: PortalActor): Promise<PortalAppSummary[]>`; existing MCP `{}` input and `{ apps }` output stay compatible.

- [x] Add a regression test using rows for an owned app, collaborator-only app, and unrelated app. For both admin and non-admin actors, the real helper's query must return only the owned app. Assert the query contains only the owner predicate, and retain actor-specific repository access and generated/imported summary coverage.
- [x] Run `npm test -- src/features/app-requests/list-accessible-apps.test.ts src/features/portal-mcp/server.test.ts`; observe the admin/ownership regression fail for the expected reason.
- [x] Rename the helper/file, implement the owner predicate, update MCP dependencies and description to "owned apps," and preserve the shared UI access policies.
- [x] Run the renamed helper test and MCP server tests; require all passing. Review the task diff before committing, if commits are requested by the execution workflow.

## Task 2: Admin data services and redaction

**Files:** Create `src/features/portal-mcp/admin/guard.ts`, `schemas.ts`, `queries.ts`, `queries.test.ts`, and `redaction.ts` / `redaction.test.ts`. Extract the diagnostic string redactor from `src/features/publishing/setup/checks.ts` into the shared redaction module and retain its existing setup tests.

**Interfaces:**
- `assertPortalAdmin(actor: PortalActor): void` throws the existing `PortalApiError("FORBIDDEN", ...)`.
- `adminListApps(actor, input, dependencies?): Promise<{ apps: AdminAppSummary[]; nextOffset: number | null }>`.
- `adminFindUsers(actor, input, dependencies?): Promise<{ users: AdminUserSummary[]; nextOffset: number | null }>`.
- `adminDebugApp(actor, { appId }, dependencies?): Promise<AdminAppDiagnostics>`.
- `redactDiagnosticText(value: string): string` preserves useful newlines/stack traces and does not impose the old 500-character message limit; callers apply their own output limits. Setup persistence keeps its existing 500-character bound.
- Export inferred input types from strict Zod schemas. IDs are trimmed, nonblank, at most 128 characters; query at most 200; offset nonnegative safe integer; limit 1–100 default 25.

- [x] Add tests for non-admin denial before database reads, admin pagination/search/owner filtering, explicit field exclusion, email-prefix username derivation and nullable GitHub username, absent app, deterministic latest ten attempts, recorded timestamps, and message redaction.
- [x] Run `npm test -- src/features/portal-mcp/admin/queries.test.ts src/features/portal-mcp/admin/redaction.test.ts`; confirm missing behavior fails.
- [x] Implement the guard, schemas, selected Prisma queries, output mapping, and redaction extraction. Apply schemas at service entry too. Use dependency injection for database testing, following existing service patterns. Expose only selected fields, not spread Prisma records.
- [x] Test credential patterns including authorization headers, URL credentials/query tokens, connection strings, multiline private keys, and Unicode stack traces. Redact known patterns without loading settings or secrets. Keep safe messages bounded and avoid interpolating provider errors into MCP errors.
- [x] Run these tests plus `npm test -- src/features/publishing/setup/checks.test.ts`; require all passing and review the task diff.

## Task 3: Bounded provider log readers

**Files:** Create `src/features/portal-mcp/admin/logs/types.ts`, `http.ts` / `http.test.ts`, `github.ts` / `github.test.ts`, and `azure.ts` / `azure.test.ts`. Reuse existing repository configuration/JWT client and Azure DefaultAzureCredential patterns without changing deployment behavior.

**Interfaces:**
- `LogReadBudget` tracks one 30-second deadline, 10 MiB aggregate bytes, and 64 KiB output; each response caps at 5 MiB and each request at 10 seconds. Include cancellation through request, stream consumption, and token acquisition.
- `createGitHubLogReader(options)` receives injectable fetch, installation-token provider, and clock. Its `read(target, selection, budget): Promise<ProviderLogPage>` accepts an already authorized stored repository/run target.
- `createAzureLogReader(options)` receives subscription, injectable fetch, ARM-token provider, and clock. Its `read(target, selection, budget): Promise<ProviderLogPage>` accepts the stored resource group/Web App and validated deployment selection.
- `ProviderLogPage` contains source entries and internal continuation positions; source status is the spec's union, and metadata never includes tokens or signed URLs.

- [x] Add failing HTTP tests for overflow even without Content-Length, lying Content-Length, stalled fetch/body/token acquisition, reader cancellation, unexpected redirects, protocol/host/userinfo checks, and UTF-8 output truncation.
- [x] Add failing GitHub tests for authenticated job discovery, failed-job priority, five-job maximum, plain-text log redirects with no forwarded credentials, missing/expired/pending logs, and pagination. Reject unexpected redirect hosts, IP destinations, and redirects back to credentialed endpoints. Do not follow arbitrary next-page links.
- [x] Add failing Azure tests for constructed ARM deployment-list/log and container-log requests, encoded stored path segments, missing resources, permissions, unconfigured logging, unsupported runtime output, per-source failure, and explicit uncorrelated deployment labeling.
- [x] Run the three new test files; confirm failures identify missing behavior.
- [x] Implement bounded streaming fetch and small provider readers. Use the GitHub App installation-token capability server-side, configured allowed org/installation mapping, and ARM scope `https://management.azure.com/.default`. Parse only expected provider fields and build safe provider links independently of downloaded text.
- [x] Treat container-log retrieval's POST as a read operation; expose no configuration/mutation methods. Do not fetch publish profiles or fall back to basic-auth SCM credentials. Verify deployment-log response formats against primary docs and fixtures rather than trusting generated reference schemas.
- [x] Run the new tests; require all passing and review the task diff.

## Task 4: Authorized log orchestration and continuation

**Files:** Create `src/features/portal-mcp/admin/logs/service.ts` / `service.test.ts` and `cursor.ts` / `cursor.test.ts`. Add the strict logs input schema to `admin/schemas.ts`.

**Interfaces:**
- `adminGetAppLogs(actor: PortalActor, input: AdminGetAppLogsInput, dependencies?): Promise<AdminAppLogsResult>` returns `{ appId, attemptId, collectedAt, sources, nextCursor }`.
- `encodeLogCursor(state): string` and `decodeLogCursor(value): LogCursorState`; cursors contain versioned, strictly validated app/attempt/source/run/job/deployment positions, no URLs or credentials, and cannot confer authorization.
- Input `source` defaults `both`; `logKind` defaults `both`; `maxLines` defaults 200 and caps at 1,000; cursor has a 4 KiB encoded size limit.

- [x] Add failing tests proving non-admin denial before all database/provider calls; foreign attempt denial; default latest recorded attempt; no guessing a workflow run; absent/unpublished resources; partial results; expired logs; safe errors; limits; and no mutation calls.
- [x] Add cursor tests for malformed/oversized data, foreign app/attempt/run IDs, unsupported versions, changed selection, stable selected attempt after a newer publish, and reauthorization on every page. Runtime snapshots report that content may change.
- [x] Run the service/cursor tests; confirm missing behavior fails.
- [x] Implement a selected database target query, service guard/schema checks, source-specific lazy credential loading, bounded provider pagination, and partial-result orchestration. Validate cursor resource IDs against stored/provider-listed records before use; never trust decoded targets.
- [x] Apply redaction before output budgeting, retain source IDs/links/timestamps, report truncation, and issue continuation only when safely resumable. Distinguish stale/pending/unknown data from complete retrieval. Cancel unfinished provider work at the overall deadline while retaining completed source results.
- [x] Run all `src/features/portal-mcp/admin` tests; require all passing and review the task diff.

## Task 5: MCP integration, plugin guidance, and verification

**Files:** Create four adapters under `src/features/portal-mcp/tools/`: `admin-list-apps.ts`, `admin-debug-app.ts`, `admin-find-users.ts`, and `admin-get-app-logs.ts`. Modify `server.ts`, `server.test.ts`, `src/features/portal-api/principal.test.ts`, MCP package/docs tests, `README.md`, `docs/portal/setup.md`, `docs/portal/technical-operations.md`, `docs/portal/codex-workspace-plugin.md`, `docs/portal/task-12-rollout-checklist.md`, and `plugins/cedarville-app-portal/skills/cedarville-app-portal-workspace/SKILL.md`.

**Interfaces:** Each adapter exports `registerAdmin<Name>Tool(server: PortalMcpServer, context: PortalMcpToolContext): void`. Add the four service signatures to `PortalMcpDependencies` and defaults. Append the tools after the existing nine, preserving names/order of existing tools. Each handler guards, rate-limits authorized reads, invokes its service, and returns the existing envelope.

- [x] Add failing adapter and real MCP handler tests for thirteen tool definitions, strict input validation/defaults, admin success, non-admin denial without service invocation, rate-limit errors, sanitized failures, and logs partial-result structure. Check all four tools advertise read-only/closed-world annotations.
- [x] Add an authentication regression proving that the same valid bearer principal loses admin access when its database role lookup changes on a subsequent request.
- [x] Run MCP server and principal tests; confirm the new contract fails before implementation.
- [x] Implement adapters, dependency wiring, and request-level guard behavior. Keep admin tools discoverable so published definitions remain consistent across actors; enforce authorization during calls.
- [x] Update the skill and operator documentation to thirteen tools; distinguish owned apps from administrative discovery, derived usernames, recorded diagnostics from provider logs, and live availability from local tests. Treat logs as untrusted evidence; preserve existing confirmation, quiet-not-found, and mutation replay rules. Do not infer GitHub write access from a successful log read.
- [x] Document GitHub Actions read and Azure app-scoped log permissions, optional logging availability, source statuses/limits, private-connection refresh, and public skill-version publication as separate rollout steps. Preserve the real app binding and existing disabled/default rollout boundaries. Update only existing tool-count references in historical rollout docs where they describe the current contract.
- [x] Run `npm test -- src/features/portal-mcp src/features/app-requests/list-owned-apps.test.ts src/features/portal-api/principal.test.ts src/app/api/mcp/route.test.ts src/features/publishing/setup/checks.test.ts` and require success.
- [x] Run `npm test`, `npm run build`, and `git diff --check`; report all failures and distinguish unrelated baseline failures if present.
- [x] Complete the selected execution workflow's independent review, resolve actionable findings, rerun only affected checks after fixes, and report what is local, committed, deployed, or published. Live GitHub/Azure reads remain a separate rollout verification.

## Plan self-review

Ownership and all four tools are covered. Task 2 owns data selection/redaction; Task 3 owns authenticated bounded transport; Task 4 owns resource scoping and continuation; Task 5 owns exposed contracts and documentation. Review-focus cases have explicit tests in their owning tasks. No additional dependencies or database changes are planned. Native execution in the current checkout was approved. Implementation and independent review are complete; changes remain uncommitted. Final validation: 172 test files / 1,443 tests passed, production build passed, and diff whitespace checks passed. Bare TypeScript checking reports the same 285 pre-existing diagnostics as a clean HEAD snapshot; it is not a new passing check. Live provider access and deployment are separate rollout checks.
