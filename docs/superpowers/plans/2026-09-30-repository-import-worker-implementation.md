# Repository Import Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Move external GitHub repository mirroring out of the CU Launch App Service process into a durable, event-driven Azure Container Apps Job with an explicit Git runtime.

**Architecture:** The portal creates an import attempt in PostgreSQL and sends only its ID to Azure Service Bus. A digest-pinned Container Apps Job atomically leases that attempt, performs the existing Git mirror with request-owned target recovery, persists the aggregate result, and settles the queue message. Same-organization imports remain synchronous because they require no mirroring; local development can explicitly use inline transport outside production.

**Tech Stack:** Next.js 15, TypeScript, Prisma/PostgreSQL, Azure Service Bus SDK, Azure Identity, Azure Container Apps Jobs, Azure Container Registry, Key Vault, Bicep, Docker, Vitest, Playwright

**Spec:** docs/superpowers/specs/2026-09-30-repository-import-worker-design.md

## Global Constraints

- Production external imports use REPOSITORY_IMPORT_TRANSPORT=service-bus; production must reject inline.
- Queue messages contain only an attempt ID; never repository details, identities, credentials, or tokens.
- One execution processes one message, with five maximum concurrent executions, a 30-minute timeout, five deliveries, 1 CPU, 2 GiB memory, and a 2 GiB mirror limit.
- The worker image runs as non-root, declares Git and CA certificates, pins Node by version and digest, and deploys an immutable ACR digest rather than latest.
- GitHub tokens exist only in mode-0600 temporary credential files and are deleted during finally cleanup.
- Duplicate delivery and expired-lease recovery must never create simultaneous mirrors or mutate an unrelated target repository.
- Preserve existing errors, support references, audit events, notifications, onboarding states, same-organization imports, and local-only imports.
- Keep public /api/health independent of Git, Service Bus, GitHub, PostgreSQL, and worker readiness.
- Preserve unrelated working-tree changes; stage and commit only task-owned files.

## Review Focus

- Worker termination after target creation: Task 5 tests exact request-marker recovery and rejects unmarked repositories.
- Duplicate delivery and expired leases: Tasks 6 and 7 test atomic claim, live-lease exclusion, expired-lease recovery, and settlement.
- Database commit followed by send failure or ambiguous timeout: Task 3 tests a durable failed attempt that an uncertain duplicate cannot claim.
- Malformed, stale, or exhausted messages: Task 7 tests dead-letter behavior and reconciliation without logging bodies.
- Oversize, timeout, network, and credential-bearing Git failures: Tasks 5, 6, and 8 test limits, classification, sanitization, and redaction.

---

## File Structure

- Prisma: schema plus one additive migration for attempt history, active attempt, and leases.
- Portal transport: focused config, queue sender, queueing service, actions, and onboarding UI.
- Worker domain: recoverable mirror, durable runner, one-message receiver, and dead-letter reconciliation.
- Worker artifact: compiled entry point, dedicated runtime package, Dockerfile, and offline mirror smoke test.
- Infrastructure: Bicep modules for ACR, Service Bus, identities, Key Vault, Container Apps Job, logs, and alerts.
- Delivery: a separate tested GitHub Actions workflow that promotes and deploys an image digest.
- Operations: setup, rollout, dead-letter, rollback, and verification documentation.

---

### Task 1: Add Durable Repository Import Attempts and Leases

**Files:**
- Modify: prisma/schema.prisma
- Create: prisma/migrations/20260930120000_repository_import_worker/migration.sql
- Create: src/features/repository-imports/attempts.ts
- Test: src/features/repository-imports/attempts.test.ts

**Interfaces:**
- Consumes: current RepositoryImport aggregate states and Prisma transactions.
- Produces: createImportAttempt, claimImportAttempt, renewImportAttemptLease, completeImportAttempt, failImportAttempt.

- [ ] **Step 1: Write failing transition tests**

Add tests named:

    creates an append-only pending attempt and makes it active
    allows only one claimant for a non-expired lease
    reclaims a running attempt only after its lease expires
    refuses completion when the caller no longer owns the lease
    clears activeAttemptId only for the matching terminal attempt

Assert a 35-minute lease, workerExecutionName, lastHeartbeatAt, and lastDeliveryCount.

- [ ] **Step 2: Run tests and schema validation to verify failure**

Run: npm test -- src/features/repository-imports/attempts.test.ts
Run: npx prisma validate
Expected: FAIL because the model and helpers do not exist.

- [ ] **Step 3: Add the additive schema and migration**

Define RepositoryImportAttemptStatus with PENDING, RUNNING, SUCCEEDED, FAILED.
Define RepositoryImportAttemptStage with ENQUEUE, CLAIM, CREATE_TARGET, TARGET_TOKEN, SOURCE_TOKEN, CLONE, PUSH, SET_DEFAULT_BRANCH, COMPLETE.
Add the approved attempt fields plus leaseExpiresAt, lastHeartbeatAt, and lastDeliveryCount.
Add named relations for attempt history and RepositoryImport.activeAttemptId. Cascade history on import deletion and set the active pointer null when its attempt is deleted.

- [ ] **Step 4: Implement exact transition interfaces**

    export type ImportAttemptLease = {
      attemptId: string;
      repositoryImportId: string;
      appRequestId: string;
      workerExecutionName: string;
      leaseExpiresAt: Date;
    };

    export function createImportAttempt(
      tx: Prisma.TransactionClient,
      input: { repositoryImportId: string; now: Date },
    ): Promise<{ attemptId: string }>;

    export function claimImportAttempt(input: {
      attemptId: string;
      workerExecutionName: string;
      deliveryCount: number;
      now: Date;
      leaseDurationMs?: number;
    }): Promise<ImportAttemptLease | null>;

    export function renewImportAttemptLease(
      lease: ImportAttemptLease,
      now: Date,
    ): Promise<ImportAttemptLease | null>;

    export function completeImportAttempt(
      lease: ImportAttemptLease,
      input: { now: Date },
    ): Promise<boolean>;

    export function failImportAttempt(
      lease: ImportAttemptLease,
      input: { stage: RepositoryImportAttemptStage; errorSummary: string; now: Date },
    ): Promise<boolean>;

Use conditional updateMany claims and lease-owner checks, never read-then-write claiming.

- [ ] **Step 5: Generate Prisma Client and verify**

Run: npm run prisma:generate
Run: npm test -- src/features/repository-imports/attempts.test.ts
Run: npx prisma validate
Expected: PASS.

- [ ] **Step 6: Commit**

Stage only Task 1 files.
Commit: feat: add durable repository import attempts

### Task 2: Add Explicit Transport Configuration and Service Bus Sender

**Files:**
- Modify: package.json
- Modify: package-lock.json
- Modify: .env.example
- Create: src/features/repository-imports/transport-config.ts
- Test: src/features/repository-imports/transport-config.test.ts
- Create: src/features/repository-imports/queue.ts
- Test: src/features/repository-imports/queue.test.ts

**Interfaces:**
- Consumes: DefaultAzureCredential and @azure/service-bus.
- Produces: RepositoryImportTransportConfig, RepositoryImportQueue, createRepositoryImportQueue.

- [ ] **Step 1: Write failing configuration tests**

Test production rejects inline, production accepts disabled, service-bus requires a fully qualified namespace and queue name, and inline is allowed only outside production.

- [ ] **Step 2: Run configuration tests to verify failure**

Run: npm test -- src/features/repository-imports/transport-config.test.ts
Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Implement the discriminated config loader**

    export type RepositoryImportTransportConfig =
      | { transport: "disabled" }
      | { transport: "inline" }
      | {
          transport: "service-bus";
          fullyQualifiedNamespace: string;
          queueName: string;
        };

    export function loadRepositoryImportTransportConfig(
      source?: Record<string, string | undefined>,
      nodeEnv?: string,
    ): RepositoryImportTransportConfig;

Document REPOSITORY_IMPORT_TRANSPORT, REPOSITORY_IMPORT_SERVICE_BUS_NAMESPACE, and REPOSITORY_IMPORT_SERVICE_BUS_QUEUE. Local example uses inline; production guidance starts disabled.

- [ ] **Step 4: Add @azure/service-bus and write failing sender tests**

Test send emits exactly one JSON body with only attemptId, messageId equals attemptId, and resources close on success and failure.

- [ ] **Step 5: Run sender tests to verify failure**

Run: npm test -- src/features/repository-imports/queue.test.ts
Expected: FAIL because the queue boundary does not exist.

- [ ] **Step 6: Implement the queue boundary**

    export type RepositoryImportQueue = {
      send(input: { attemptId: string }): Promise<void>;
    };

    export function createServiceBusRepositoryImportQueue(input: {
      fullyQualifiedNamespace: string;
      queueName: string;
      credential?: TokenCredential;
      clientFactory?: ServiceBusClientFactory;
    }): RepositoryImportQueue;

    export function createRepositoryImportQueue(input?: {
      config?: RepositoryImportTransportConfig;
    }): RepositoryImportQueue;

Instantiate DefaultAzureCredential only in the default service-bus factory. Disabled throws the plain-language unavailable message. Inline is supplied by Task 3.

- [ ] **Step 7: Verify and commit**

Run: npm test -- src/features/repository-imports/transport-config.test.ts src/features/repository-imports/queue.test.ts
Expected: PASS.
Commit: feat: add repository import queue transport

### Task 3: Persist and Queue External Import Requests

**Files:**
- Create: src/features/repository-imports/queue-import.ts
- Test: src/features/repository-imports/queue-import.test.ts
- Modify: src/features/repository-imports/actions.ts
- Test: src/features/repository-imports/actions.test.ts

**Interfaces:**
- Consumes: createImportAttempt and RepositoryImportQueue.send.
- Produces: queueExternalRepositoryImport and a non-production inline adapter.

- [ ] **Step 1: Write failing transaction and enqueue tests**

Test request/import/attempt commit before send, successful send returns pending promptly, send failure durably fails the exact attempt at ENQUEUE, an ambiguously sent failed attempt cannot be claimed, and same-org imports create no attempt.

- [ ] **Step 2: Run tests to verify failure**

Run: npm test -- src/features/repository-imports/queue-import.test.ts src/features/repository-imports/actions.test.ts
Expected: FAIL because external imports still run Git synchronously.

- [ ] **Step 3: Implement queueExternalRepositoryImport**

    export type QueueExternalRepositoryImportInput = {
      userId: string;
      appName: string;
      description: string;
      source: RepositoryMetadata;
      targetOwner: string;
      targetName: string;
      targetVisibility: GitHubRepoVisibility;
      supportReference: string;
    };

    export function queueExternalRepositoryImport(
      input: QueueExternalRepositoryImportInput,
      deps?: {
        db?: typeof prisma;
        queue?: RepositoryImportQueue;
        now?: () => Date;
      },
    ): Promise<{ requestId: string; attemptId: string; queued: boolean }>;

Create AppRequest, RepositoryImport, and the active attempt in one transaction. Send afterward. On send failure, mark the still-active attempt, import, and request failed, record existing audit/notification evidence, and return queued false.

- [ ] **Step 4: Refactor addExistingAppAction**

Keep validation, actor resolution, source access checks, same-org behavior, support references, and target-name derivation. Replace only the production external mirror branch. Adapt inline local/test behavior behind RepositoryImportQueue instead of branching inside the action.

- [ ] **Step 5: Verify and commit**

Run: npm test -- src/features/repository-imports/queue-import.test.ts src/features/repository-imports/actions.test.ts
Expected: PASS.
Commit: feat: queue external repository imports

### Task 4: Add Progress and Authorized Retry UX

**Files:**
- Modify/Test: src/features/repository-imports/actions.ts and actions.test.ts
- Modify/Test: src/features/onboarding/state.ts and state.test.ts
- Modify/Test: src/app/onboarding/[requestId]/page.tsx and page.test.tsx

**Interfaces:**
- Consumes: Task 3 queueing and Task 1 append-only attempts.
- Produces: retryRepositoryImportAction(requestId) and queued/running presentation.

- [ ] **Step 1: Write failing UX and authorization tests**

Test pending shows queued copy, running shows active copy, retry appears only after terminal failure, only owner/admin may retry, retry creates a new attempt, and retry rejects an active attempt.

- [ ] **Step 2: Run tests to verify failure**

Run: npm test -- src/features/onboarding/state.test.ts src/app/onboarding/[requestId]/page.test.tsx src/features/repository-imports/actions.test.ts
Expected: FAIL.

- [ ] **Step 3: Implement state and retry**

Add IMPORT_PENDING before generic repository pending when importStatus is PENDING or RUNNING. Reuse auto-refresh. Implement retryRepositoryImportAction with owner/admin authorization, FAILED precondition, atomic active-attempt creation, queue send, and Task 3 enqueue-failure finalization.

- [ ] **Step 4: Verify and commit**

Run the Step 2 command with the bracketed paths quoted in the shell.
Expected: PASS.
Commit: feat: add repository import retry flow

### Task 5: Make Target Creation Recoverable and Bound Git Execution

**Files:**
- Modify/Test: src/features/repositories/github-app.ts and github-app.test.ts
- Modify/Test: src/features/repository-imports/import-repository.ts and import-repository.test.ts

**Interfaces:**
- Consumes: appRequestId and target name from durable state.
- Produces: recoverable importRepositoryWithHistory with target callback and limits.

- [ ] **Step 1: Write failing ownership and limit tests**

Test marker creation, exact-marker reuse, unmarked collision refusal, onTargetReady before clone, recovery after simulated death following target creation, timeout/oversize termination, and token redaction.

Use exact description marker: CU Launch import request:<appRequestId>.

- [ ] **Step 2: Run tests to verify failure**

Run: npm test -- src/features/repositories/github-app.test.ts src/features/repository-imports/import-repository.test.ts
Expected: FAIL.

- [ ] **Step 3: Extend repository metadata and create/reuse behavior**

Return description from getRepository. Call existing createRepository ownership-marker support with reuseIfAlreadyExists true. Convert a mismatched marker to TARGET_REPOSITORY_ALREADY_EXISTS so suffix search stays safe.

- [ ] **Step 4: Extend the mirror interface**

    export type ImportRepositoryWithHistoryInput = {
      appRequestId: string;
      source: RepositoryMetadata;
      target: { owner: string; name: string; visibility: GitHubRepoVisibility };
      github: TargetGitHubClient;
      sourceGithub?: SourceGitHubClient;
      onTargetReady?: (repository: RepositoryMetadata) => Promise<void>;
      limits?: { timeoutMs: number; maxBytes: number };
      exec?: GitExec;
    };

Invoke onTargetReady immediately after create or verified reuse. Extend GitExec with abort/timeout and working-directory byte accounting without putting credentials in command arguments.

- [ ] **Step 5: Verify and commit**

Run the Step 2 command.
Expected: PASS.
Commit: feat: make repository mirrors recoverable

### Task 6: Implement the Durable Attempt Runner

**Files:**
- Create/Test: src/features/repository-imports/run-import-attempt.ts and run-import-attempt.test.ts
- Modify: src/lib/audit.ts

**Interfaces:**
- Consumes: Task 1 leases and Task 5 mirror callback.
- Produces: runRepositoryImportAttempt and RepositoryImportRunResult.

- [ ] **Step 1: Write failing state-machine tests**

Test live lease means no provider work, expired lease recovers the same marked target, target metadata persists before clone, success updates all aggregate state atomically, 408/429/5xx/network are transient, permission/validation/size/timeout are terminal, transient release emits no failure notification, and terminal failure notifies once with sanitized text.

- [ ] **Step 2: Run tests to verify failure**

Run: npm test -- src/features/repository-imports/run-import-attempt.test.ts
Expected: FAIL.

- [ ] **Step 3: Implement the result and runner**

    export type RepositoryImportRunResult =
      | { disposition: "complete"; result: "succeeded" | "already-terminal" }
      | { disposition: "abandon"; errorSummary: string }
      | { disposition: "dead-letter"; errorSummary: string };

    export function runRepositoryImportAttempt(
      input: {
        attemptId: string;
        workerExecutionName: string;
        deliveryCount: number;
      },
      deps?: RepositoryImportRunnerDeps,
    ): Promise<RepositoryImportRunResult>;

Create GitHub clients only after lease acquisition. Persist target data in onTargetReady. Complete success in one DB transaction before audit/notification. Release transient failures to PENDING only while holding the lease. Finalize terminal failures once.

- [ ] **Step 4: Add structured redacted logging**

Log support reference, request/import/attempt IDs, execution name, stage, commit, and image digest. Never log message bodies, tokens, credential paths, environment objects, or raw error objects.

- [ ] **Step 5: Verify and commit**

Run: npm test -- src/features/repository-imports/run-import-attempt.test.ts src/features/repository-imports/import-repository.test.ts
Expected: PASS.
Commit: feat: run durable repository import attempts

### Task 7: Add the One-Message Worker and Dead-Letter Reconciliation

**Files:**
- Create/Test: src/workers/repository-import/message.ts and message.test.ts
- Create/Test: src/workers/repository-import/main.ts and main.test.ts
- Create/Test: scripts/repository-imports/reconcile-dead-letter.ts and reconcile-dead-letter.test.ts
- Modify: package.json

**Interfaces:**
- Consumes: Task 6 runner and Task 2 service-bus config.
- Produces: one-message executable and single-attempt reconciliation command.

- [ ] **Step 1: Write failing parse and settlement tests**

Test only an object with one non-empty attemptId is accepted; malformed bodies dead-letter without body logs; complete handles success/already-terminal; abandon applies before delivery five; delivery five dead-letters; locks renew while active; resources close before success; empty receive exits zero.

- [ ] **Step 2: Run worker tests to verify failure**

Run: npm test -- src/workers/repository-import/message.test.ts src/workers/repository-import/main.test.ts
Expected: FAIL because the entry point does not exist.

- [ ] **Step 3: Implement worker interfaces**

    export function parseRepositoryImportMessage(body: unknown): {
      attemptId: string;
    };

    export function processRepositoryImportMessage(
      message: ServiceBusReceivedMessage,
      deps: RepositoryImportMessageDeps,
    ): Promise<void>;

    export function runRepositoryImportWorker(
      deps?: RepositoryImportWorkerDeps,
    ): Promise<"processed" | "idle">;

Use peek-lock, receive one message, renew lock on a bounded interval, and settle from RepositoryImportRunResult.

- [ ] **Step 4: Write failing reconciliation tests**

Test one explicit attempt ID reconciles an active dead-lettered attempt once, while missing and terminal attempts are no-ops. Output identifiers and sanitized reason only.

- [ ] **Step 5: Run reconciliation tests to verify failure**

Run: npm test -- scripts/repository-imports/reconcile-dead-letter.test.ts
Expected: FAIL because the operator command does not exist.

- [ ] **Step 6: Implement reconciliation**

    export function reconcileDeadLetteredAttempt(
      attemptId: string,
      deps?: ReconcileDeadLetterDeps,
    ): Promise<"reconciled" | "already-terminal" | "missing">;

Do not add a bulk mode.

- [ ] **Step 7: Verify and commit**

Run: npm test -- src/workers/repository-import/message.test.ts src/workers/repository-import/main.test.ts scripts/repository-imports/reconcile-dead-letter.test.ts
Expected: PASS.
Commit: feat: add repository import service bus worker

### Task 8: Build and Smoke-Test the Immutable Worker Image

**Files:**
- Modify: package.json and package-lock.json
- Create: tsup.repository-import.config.ts
- Create: workers/repository-import/package.json and package-lock.json
- Create: workers/repository-import/Dockerfile and .dockerignore
- Create: scripts/repository-imports/container-smoke.sh
- Test: scripts/repository-imports/container-contract.test.ts

**Interfaces:**
- Consumes: Task 7 entry point.
- Produces: build:repository-import-worker and test:repository-import-container scripts plus a non-root OCI image.

- [ ] **Step 1: Write failing image-contract tests**

Assert exact node:24.x.y-bookworm-slim@sha256:<64 hex>, explicit git and ca-certificates, non-root USER, /tmp/repository-import mirror root, no latest, compiled entry point rather than tsx, and runtime dependency alignment.

- [ ] **Step 2: Run image-contract tests to verify failure**

Run: npm test -- scripts/repository-imports/container-contract.test.ts
Expected: FAIL because worker image assets do not exist.

- [ ] **Step 3: Resolve and pin the approved Node digest**

Run: docker buildx imagetools inspect node:24-bookworm-slim
Expected: manifest and platform digests. Record the approved versioned digest in Dockerfile.

- [ ] **Step 4: Add compiled build and runtime package**

Add tsup as dev dependency and bundle Node ESM. Externalize only dependencies listed by the worker runtime package. Copy generated Prisma client/runtime into the final image.

- [ ] **Step 5: Add offline non-root mirror smoke test**

Inside the image: assert git --version, create a disposable local source with a branch and tag, mirror into a bare target, and verify both refs. Use no network or credentials.

- [ ] **Step 6: Build and verify**

Run: npm test -- scripts/repository-imports/container-contract.test.ts
Run: docker build -f workers/repository-import/Dockerfile -t cu-launch-repository-import-worker:test .
Run: npm run test:repository-import-container
Expected: PASS, image builds, Git works as non-root, branch/tag mirror succeeds.

- [ ] **Step 7: Commit**

Commit: build: add repository import worker image

### Task 9: Define Least-Privilege Azure Infrastructure with Bicep

**Files:**
- Create: infra/repository-import-worker/main.bicep
- Create: infra/repository-import-worker/modules/{registry,messaging,identity,job,monitoring}.bicep
- Create: infra/repository-import-worker/main.bicepparam.example
- Create: infra/repository-import-worker/README.md
- Test: infra/repository-import-worker/contract.test.ts

**Interfaces:**
- Consumes: Task 8 image.
- Produces: validated resources and explicit portal/deployment outputs.

- [ ] **Step 1: Write failing Bicep contract tests**

Assert ACR, Service Bus queue, Container Apps environment/job, workload identity, separate pull identity, Key Vault, Log Analytics, alerts, max delivery five, max executions five, timeout 1800, CPU 1, memory 2 GiB, completion one, queue length one.

Assert queue-scoped Data Sender for portal, queue-scoped Data Receiver and vault secret-read for worker, and AcrPull for pull identity. Reject owner/contributor and wildcard job-operation roles.

- [ ] **Step 2: Run infrastructure contract tests to verify failure**

Run: npm test -- infra/repository-import-worker/contract.test.ts
Expected: FAIL because the Bicep modules do not exist.

- [ ] **Step 3: Implement modules and outputs**

main.bicep accepts location, safe names, portal principal ID, image digest, database network inputs, and existing resource IDs where needed. Output namespace, queue, ACR login server, job, identity IDs, vault URI, and logs. Do not accept secret values as Bicep parameters.

- [ ] **Step 4: Validate locally**

Run: az bicep build --file infra/repository-import-worker/main.bicep
Run: npm test -- infra/repository-import-worker/contract.test.ts
Expected: PASS.

- [ ] **Step 5: Run read-only what-if**

Run an az deployment group what-if against rg-cu-app-portal with an ignored administrator parameter file.
Expected: only documented worker resources and scoped assignments.

- [ ] **Step 6: Commit**

Commit: infra: define repository import worker resources

### Task 10: Add Tested Image Promotion and Digest Deployment

**Files:**
- Create/Test: .github/workflows/deploy-repository-import-worker.yml and deploy-repository-import-worker.test.ts
- Verify: .github/workflows/deploy-azure-app-service.yml
- Modify: docs/portal/setup.md

**Interfaces:**
- Consumes: Task 8 image and Task 9 outputs.
- Produces: OIDC-authenticated, SHA-tagged, digest-pinned worker deployment.

- [ ] **Step 1: Write failing workflow contract tests**

Assert unit tests, Prisma validation, worker build, container smoke, and vulnerability scan precede push; Azure uses OIDC; image tag is commit SHA; ACR digest is resolved; job update uses repository@sha256; latest is absent. Assert portal workflow neither packages Git nor deploys worker.

- [ ] **Step 2: Run workflow tests to verify failure**

Run: npm test -- .github/workflows/deploy-repository-import-worker.test.ts
Expected: FAIL because the worker workflow does not exist.

- [ ] **Step 3: Implement workflow**

Trigger manually and on main changes limited to worker/import/schema/infra paths. Build once, test the same image, push SHA, resolve digest, update the job by digest, wait for update, and write digest to the summary. Do not manage Key Vault values in CI.

- [ ] **Step 4: Verify**

Run: npm test -- .github/workflows/deploy-repository-import-worker.test.ts
Parse workflow YAML with the repository's available YAML parser.
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: ci: deploy repository import worker by digest

### Task 11: Complete Operations Docs and Product Regression Coverage

**Files:**
- Modify: README.md
- Modify: docs/portal/setup.md
- Modify: docs/portal/technical-operations.md
- Modify/Test: src/app/apps/page.test.tsx
- Modify/Test: src/app/onboarding/[requestId]/page.test.tsx
- Modify: current existing-app Playwright spec
- Test: docs/readme.test.ts

**Interfaces:**
- Consumes: implemented behavior and Azure outputs.
- Produces: local, rollout, dead-letter, promotion, secret rotation, and rollback guidance.

- [ ] **Step 1: Write failing docs and product tests**

Assert docs cover inline local mode, service-bus production, disabled rollback, dead-letter response, image promotion, Key Vault rotation, controlled smoke import, and public health independence.

Add UI tests that external import returns promptly in pending state, auto-refreshes, hides provider diagnostics from ordinary users, and offers retry only on terminal failure.

- [ ] **Step 2: Run focused tests to verify failure**

Run the docs, apps, onboarding, and actions tests named in this task.
Expected: FAIL until the asynchronous copy, retry surface, and operations guidance are complete.

- [ ] **Step 3: Update docs and E2E**

Document exact setting names and commands without real secrets. Add async existing-app E2E using test transport; local E2E must not require Azure.

- [ ] **Step 4: Verify**

Run focused docs, apps, onboarding, actions tests.
Run: npm run test:e2e -- --grep "existing app"
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: docs: add repository import worker operations

### Task 12: Verify, Preview, and Roll Out Safely

**Files:**
- Verify all task-owned files.
- Make no source edits unless a failure gets a focused test/fix commit.

**Interfaces:**
- Consumes: completed code and administrator-owned Azure values.
- Produces: local evidence, Azure what-if, and only after live-rollout confirmation, controlled deployment evidence.

- [ ] **Step 1: Run complete local verification**

Run:

    npm test
    npm run build
    npx prisma validate
    npm run build:repository-import-worker
    npm run test:repository-import-container
    az bicep build --file infra/repository-import-worker/main.bicep
    git diff --check

Expected: PASS. Record test counts, image ID/digest, Git version, and Bicep output.

- [ ] **Step 2: Inspect repository and migration safety**

Run git status, intended branch diff, and Prisma migration diff.
Expected: only planned files; additive migration retains existing imports.

- [ ] **Step 3: Run Azure what-if and obtain live-rollout confirmation**

Present exact creates/updates and assignments. Do not run deployment create, add secret values, change App Service settings, or enable transport until the user confirms after seeing what-if.

- [ ] **Step 4: Provision after confirmation**

Deploy reviewed Bicep, add secrets through non-echoing administrator actions, deploy worker by digest, keep transport disabled, then verify identities and job configuration read-only.

- [ ] **Step 5: Run controlled smoke import**

Queue one approved public repository. Observe PENDING to RUNNING to SUCCEEDED. Verify branches, tags, default branch, history, duplicate delivery idempotency, and safe recovery after terminating a disposable execution following target creation.

- [ ] **Step 6: Enable production queueing and verify**

Set service-bus transport and namespace/queue on cu-app-portal; restart once; verify public /api/health HTTP 200; submit one controlled portal import; verify audit, notification, onboarding, target history, metrics, and zero token leakage.

- [ ] **Step 7: Report final state**

Separate committed/local proof, Azure resources and digest, controlled import evidence, current transport mode, and any administrator-owned gates. Never claim live success from local tests, what-if, an unpushed commit, or an unexecuted image.

---

## Final Plan Self-Review

- Every approved spec section maps to Tasks 1 through 12.
- Lease metadata closes worker-crash recovery without changing the approved architecture.
- Cross-task names are defined before use.
- Each review-focus failure has a named test in its owning task.
- Provider mutations remain behind durable state and an explicit live-rollout confirmation.
- Public health and unrelated working-tree UI changes remain untouched.
