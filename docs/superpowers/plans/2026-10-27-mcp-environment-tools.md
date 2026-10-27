# MCP Environment Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Read saved ordinary environment settings and update up to 100 variables with one Azure settings update, without exposing secret values.

**Architecture:** Actor-aware services authorize access and project safe variable records; thin MCP adapters apply rate limits and idempotency. Reuse the existing batch environment service, explicitly passing `isSecret: false` for all writes.

**Tech Stack:** TypeScript, Next.js, Prisma, Zod, Vitest, existing MCP server and Azure clients.

**Spec:** `docs/superpowers/specs/2026-10-27-mcp-environment-tools-design.md` (approved by user).

## Global Constraints

- Ordinary settings only; secret entry and replacement stay in CU Launch.
- Read page default 25, maximum 100; write batch 1–100 variables.
- Authorize before variable/provider access and before replay; no raw values in mutation output, audits, cached results, or errors.
- One Azure settings update per batch; preserve unrelated settings. No automatic publish.
- Keep work local; reuse the current checkout and native execution already selected in this conversation.

## Review Focus

- Misclassified sensitive keys or credential-bearing values are withheld in full and rejected on write.
- Normalized collisions cannot replace secrets or apply part of an invalid batch.
- Revoked app access blocks cached write results and provider calls.
- Provider/database exceptions containing submitted values become fixed safe errors.
- A multi-variable batch invokes one Azure settings write, preserving existing secret references.

### Task 1: Environment services and MCP contracts

**Files:**
- Create `src/features/portal-mcp/environment/{schemas,safety,service}.ts` and corresponding service/safety/concurrency tests.
- Add `src/features/env-vars/lock.ts`/test and serialize shared UI/MCP saves in `service.ts`; update its dependency fixture.
- Create `src/features/portal-mcp/tools/{get-app-environment,set-app-environment}.ts` and environment adapter tests.
- Modify `src/features/portal-mcp/server.ts`, `server.test.ts`, `src/features/portal-api/rate-limit.ts`, and `rate-limit.test.ts`.

**Interfaces:**
- `getAppEnvironment(actor, input, dependencies?)` returns `{ appId, variables, nextOffset, evidence }`.
- `authorizeEnvironmentApp(actor, appId, db?)` returns the accessible service app record.
- `setAppEnvironment(actor, input, dependencies?)` reauthorizes, validates, saves a batch, audits metadata, and returns `{ appId, keys, application }`.
- Read input `{ appId, offset?, limit? }`; write input `{ appId, variables: Array<{ key, value }>, idempotencyKey }`.

- [x] Write failing tests for role access, secret metadata-only projection, filtered ordinary values, pagination, normalized conflicts, safe failures, batch prevalidation, no Key Vault access, and one live Azure update using the real batch service with fake provider transport.
- [x] Run the new tests and confirm missing modules/exports fail before implementation.
- [x] Implement strict schemas, conservative sensitivity checks, authorized services, and thin adapters. Add dedicated `set_app_environment` rate policy (10 requests/hour) with downward-only override.
- [x] Test adapter annotations, strict schemas and bounds, safe text/structured results, read/write rate limiting, idempotent replay, and revoked authorization before replay. Update the server dependency fixture and exact tool list to fifteen tools.
- [x] Run environment, MCP server, existing environment service, and rate-limit tests; require all passing.

### Task 2: Guidance, documentation, and final verification

**Files:**
- Modify workspace plugin `SKILL.md`, plugin version, README, setup guide, MCP runbook/operations checklist, and relevant MCP documentation/package tests.
- Update approved design status and this plan's progress.

**Interfaces:** Consume Task 1's exact tool contracts; guidance covers batch upserts and routes secret entry/replacement to CU Launch.

- [x] Add failing documentation assertions for both tools, batch limit, restart behavior, no credential solicitation, and stable replay.
- [x] Update package guidance and operator docs; explain saved versus live values, secret-classification limitations, safe failures, and no cross-system rollback guarantee.
- [x] Run relevant tests, full `npm test`, and `npm run build`. Inspect new files directly against the secret-hygiene patterns because untracked files are omitted by its tracked-file scan.
- [x] Have one fresh reviewer inspect the whole change and permission/secret boundaries; fix any important findings with failing regression tests first.
- [x] Leave local changes reviewable and report verified results and deployment status; do not commit/push without a new request.
