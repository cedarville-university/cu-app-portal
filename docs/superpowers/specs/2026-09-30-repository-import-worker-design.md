# Repository Import Worker Design

## Summary

CU Launch must stop depending on the mutable Azure App Service Node runtime to
provide the `git` executable. Repository mirroring will move from the portal
request process to an event-driven Azure Container Apps Job. The job will run
an immutable worker image that explicitly contains Git, consume one Azure
Service Bus message per execution, and update the existing durable repository
import state in PostgreSQL.

The portal remains on Azure App Service. Existing user-facing import states,
plain-language errors, audit events, notifications, and onboarding refresh
behavior remain the product contract.

## Problem

The current importer calls `spawn("git", ...)` from the portal App Service.
The managed `NODE|24-lts` Linux runtime no longer exposes Git, so a source
clone fails with `spawn git ENOENT` before any GitHub request is made. The
application never declared Git as a production dependency; it worked only
while the managed runtime happened to contain the binary.

Repository mirroring is also a poor fit for a synchronous web request. It can
consume significant time, temporary disk, network bandwidth, and credentials.
A web-container restart can interrupt the operation after the target
repository has already been created.

## Goals

- Make Git an explicit, versioned, deployment-tested dependency.
- Keep Git clone and push work outside the public portal process.
- Preserve full repository history and refs with the existing mirror behavior.
- Return quickly from the portal after durably queueing an import.
- Make duplicate delivery, worker restart, timeout, and retry safe.
- Preserve current authorization, ownership, status, audit, notification, and
  user-facing error behavior.
- Use managed identity and least privilege for Azure resources.
- Keep local development and unit tests practical without requiring Azure.

## Non-goals

- Moving the entire portal into a custom container.
- Replacing Git mirroring with GitHub template generation or a JavaScript Git
  implementation.
- Changing imported-app compatibility analysis or publishing preparation.
- Adding a general-purpose background-job framework for unrelated work.
- Making Git availability part of the public `/api/health` contract.

## Approaches Considered

### 1. Event-driven Container Apps Job with Service Bus

This is the selected approach. Each queue message starts finite, isolated
compute with explicit CPU, memory, disk, and timeout limits. The worker image
owns its Git dependency and can be promoted or rolled back independently of
the portal.

### 2. Custom container for the complete portal

This would restore Git with less application refactoring, but repository
mirrors would remain synchronous web work. It couples web releases and Git
tooling, expands the public process's credential and filesystem exposure, and
does not solve interruption or concurrency concerns.

### 3. GitHub APIs or a JavaScript Git implementation

This removes the operating-system binary but replaces a mature mirror protocol
with substantially more object, ref, authentication, and compatibility code.
It is not justified while full-history Git mirroring remains the requirement.

## Architecture

The production flow is:

1. The portal validates the signed-in user and source repository exactly as it
   does today.
2. In one database transaction, the portal creates the `AppRequest`, its
   `RepositoryImport`, and a `RepositoryImportAttempt` in `PENDING` state.
3. The portal sends a Service Bus message containing only the attempt ID.
4. If enqueueing fails, the portal marks that attempt and import failed at the
   `ENQUEUE` stage. The existing recovery surface can offer a retry.
5. The event-driven Container Apps Job receives the message and atomically
   changes that exact attempt from `PENDING` to `RUNNING`. A duplicate message
   that cannot claim the attempt exits successfully without provider changes.
6. The worker loads all repository and actor context from PostgreSQL, obtains
   short-lived GitHub App installation tokens, creates or verifies the managed
   target repository, and runs the existing mirror operation.
7. The worker atomically records success or a sanitized stage-specific failure,
   writes audit evidence, and sends the existing lifecycle notification.
8. The portal's existing polling UI observes the durable state and advances to
   preparation only after import success.

The Service Bus message is a wake-up signal, not a source of authority. It
contains no repository URL, user identity, GitHub token, private key, or other
secret. PostgreSQL remains the authoritative job and product state.

## Data Model

Add a `RepositoryImportAttempt` model related to `RepositoryImport`:

- `id`
- `repositoryImportId`
- `status`: `PENDING`, `RUNNING`, `SUCCEEDED`, or `FAILED`
- `stage`: `ENQUEUE`, `CLAIM`, `CREATE_TARGET`, `TARGET_TOKEN`,
  `SOURCE_TOKEN`, `CLONE`, `PUSH`, `SET_DEFAULT_BRANCH`, or `COMPLETE`
- `errorSummary`
- `queuedAt`
- `startedAt`
- `finishedAt`
- `workerExecutionName`
- `createdAt`
- `updatedAt`

`RepositoryImport` retains its current aggregate `importStatus` and
`importErrorSummary` fields for UI compatibility. It also gains
`activeAttemptId` so retry creation and duplicate form submissions can be
claimed atomically. Historical attempts remain append-only operational
evidence.

The initial transaction records external imports as:

- `AppRequest.repositoryStatus = PENDING`
- `RepositoryImport.importStatus = PENDING`
- `RepositoryImport.preparationStatus = NOT_STARTED`
- new attempt `status = PENDING`, `stage = ENQUEUE`

On success, the worker sets repository metadata, changes repository status to
`READY`, import status to `SUCCEEDED`, and preparation status to
`PENDING_USER_CHOICE`. On terminal failure it sets repository and import status
to `FAILED`, preparation status to `BLOCKED`, and retains any safely identified
partial target repository metadata.

## Target Repository Idempotency

The worker must not create a new target repository on every retry.

- Reserve and persist the candidate target name before provider mutation.
- Mark a newly created target repository with a request-specific ownership
  value in its GitHub description.
- If a retry encounters an existing repository, reuse it only when the marker
  exactly matches the same CU Launch request.
- Never reuse, overwrite, delete, or mirror into an unmarked repository.
- Persist the target URL and default branch as soon as they are known.
- Preserve the existing suffix search for genuine unrelated name collisions.

This makes a crash after target creation recoverable without treating an
unrelated repository as portal-owned.

## Queue and Retry Semantics

Use one Service Bus queue dedicated to repository imports.

- Delivery is treated as at least once.
- The portal uses a bounded send timeout and records enqueue failure
  durably instead of leaving an unexplained `PENDING` record.
- The worker uses an atomic database claim as the duplicate-delivery guard.
- A successfully processed or already-terminal attempt completes its message.
- A transient failure abandons the message only while the configured delivery
  budget remains.
- A terminal provider, validation, size, or timeout failure is recorded and the
  message is completed.
- Exhausted messages move to the Service Bus dead-letter queue and are also
  reconciled to a user-visible failed attempt by an operator command.
- User retry creates a new attempt; it never mutates attempt history back to
  `PENDING`.

The first release does not add a transactional outbox. The database attempt is
created before the Service Bus send; a send failure is caught synchronously and
recorded as a retryable failed attempt. This keeps the failure explicit without
introducing a second always-on dispatcher.

## Worker Image

Create a dedicated multi-stage Dockerfile for the repository import worker.

- Pin the Node base image by version and digest.
- Install Git and CA certificates explicitly in the runtime stage.
- Run as a non-root user.
- Include only the compiled worker, Prisma runtime, required application
  modules, and production dependencies.
- Set a read-only root filesystem where supported and use a bounded temporary
  working directory for mirrors and credential files.
- Tag images with the Git commit SHA and deploy the resolved ACR digest, never
  `latest`.
- Record Node, Git, application commit, and image digest in startup logs without
  logging configuration values or secrets.

The image build must fail unless `git --version` succeeds. A container smoke
test must also execute a local clone/push mirror against disposable local bare
repositories before the image is published.

## Azure Resources and Identity

Provision declaratively with Bicep under `infra/repository-import-worker/`:

- Azure Container Registry
- Azure Service Bus namespace and repository-import queue
- Azure Container Apps managed environment
- event-driven Azure Container Apps Job
- worker workload managed identity
- separate ACR-pull managed identity
- least-privilege role assignments
- Log Analytics integration and operational alerts

The portal App Service identity receives Azure Service Bus Data Sender on only
the import queue. The worker workload identity receives Data Receiver on only
that queue, Key Vault secret-read access for worker secrets, and the minimum
database network access. The ACR-pull identity receives only `AcrPull`.

Do not grant broad Container Apps Jobs Operator or Contributor roles to routine
operators. Microsoft documents that job start permissions can permit use of a
job's secrets and managed identities; deployment and break-glass access must be
narrowly scoped.

## Secrets

The worker reads secret values through Key Vault references using its workload
identity. Required secrets are the PostgreSQL connection string, GitHub App
private key, and SMTP credentials needed by the existing notification service.
Non-secret GitHub App IDs, installation mappings, allowed organizations, queue
namespace, and resource names remain ordinary configuration.

GitHub installation tokens are created just in time, written only to
mode-`0600` temporary credential files, never included in process arguments,
and deleted with the mirror directory in a `finally` block. Existing error
sanitization remains mandatory.

## Application Boundaries

Split the current synchronous action into three independently testable units:

1. `queueRepositoryImport` validates and persists the portal request and sends
   an attempt ID through an injected queue client.
2. `runRepositoryImportAttempt` owns claim, GitHub orchestration, durable state
   transitions, audit, and notifications. It accepts injected GitHub, Git, DB,
   and notification dependencies for tests.
3. The worker entry point receives one Service Bus message, calls the runner,
   and maps the result to complete, abandon, or dead-letter behavior.

`importRepositoryWithHistory` remains the low-level Git mirror component. Its
creation and retry inputs will be extended for target ownership verification,
but clone/push behavior and sanitized errors remain centralized there.

## Configuration

Add an explicit transport setting:

- `REPOSITORY_IMPORT_TRANSPORT=service-bus` is required in production.
- `REPOSITORY_IMPORT_TRANSPORT=inline` is available only outside production for
  local development and targeted tests.
- `REPOSITORY_IMPORT_TRANSPORT=disabled` gives operators a safe rollback mode
  that blocks new external imports with a plain-language message while leaving
  same-organization and local-only flows available.

Production configuration must reject `inline`. The queue namespace and name
are required only for `service-bus`. The portal authenticates with
`DefaultAzureCredential`; no Service Bus connection string is stored in App
Service settings.

## Limits

Initial production limits are explicit and configurable:

- one message per job execution
- maximum five concurrent executions
- 30-minute execution timeout
- maximum five deliveries before dead-lettering
- 2 GiB worker memory and 1 CPU as the initial profile
- 2 GiB maximum source mirror size, measured during clone and enforced by
  worker disk and timeout controls

These are safety defaults, not product promises. Operational evidence may
justify later changes.

## Error Handling and User Experience

Preserve the existing user-safe summaries and support reference. Add clear
operator stages for enqueue, worker claim, and dead-letter failure. Users see
that copying is queued or in progress while the onboarding page auto-refreshes.
They see a retry action only after a terminal failure.

No raw Git stderr, Azure message, stack trace, token, credential path, database
URL, or private repository URL with embedded credentials may reach the UI,
notification, audit details, or structured logs.

## Observability

Every log entry includes the support reference, app request ID, import ID,
attempt ID, worker execution name, and stage. It excludes secrets and command
arguments that can contain credentials.

Operational metrics and alerts cover:

- queue depth and oldest-message age
- dead-letter count
- execution success, failure, and timeout counts
- time from queue to claim and claim to completion
- failures grouped by sanitized stage
- worker image digest and application commit

The public `/api/health` endpoint remains independent of Git, Service Bus,
GitHub, PostgreSQL, and the worker. Worker readiness is proven by CI image tests
and a restricted deployment smoke import.

## Testing

### Unit and state-transition tests

- queue payload contains only a validated attempt ID
- production rejects inline transport
- enqueue failure becomes a durable retryable failure
- only one worker claims a pending attempt
- duplicate delivery performs no provider mutation
- success and each failure stage produce the expected aggregate state
- retries create append-only attempts
- target ownership marker permits only same-request recovery
- credential and error sanitization never expose tokens

### Integration tests

- Service Bus sender and receiver adapters against test doubles
- PostgreSQL claim concurrency with two worker processes
- disposable local bare repositories prove full mirror behavior
- worker container smoke test proves Git is installed and usable as the
  non-root runtime user

### End-to-end staging proof

- submit a controlled public source repository
- observe `PENDING`, `RUNNING`, and `SUCCEEDED`
- verify branches, tags, default branch, and commit history in the target
- redeliver the same message and prove no duplicate target or mutation
- force a clone failure and verify sanitized UI, audit, notification, and retry
- terminate a worker after target creation and prove safe recovery

## Delivery and Rollback

1. Provision the queue, registry, identities, Key Vault references, Container
   Apps environment, job, logs, and alerts.
2. Build, scan, test, publish, and deploy the worker image by digest.
3. Run the worker smoke import without changing portal traffic.
4. Deploy the portal schema and queueing code with transport `disabled`.
5. Enable `service-bus` and run one controlled import.
6. Monitor queue age, worker failures, GitHub effects, and database states
   before general use.

Rollback sets transport to `disabled`, preventing new external imports without
falling back to the Git-less web runtime. In-flight attempts may finish. The
worker can be rolled back independently to the prior known-good image digest.
Database migrations are additive; attempt history is retained.

## Documentation

Update `README.md`, `docs/portal/setup.md`, and
`docs/portal/technical-operations.md` with local mode, production settings,
worker deployment, retry/dead-letter response, image promotion, rollback, and
credential-rotation procedures.

## Acceptance Criteria

- Production external-repository imports never spawn Git in the portal App
  Service process.
- The deployed worker image proves Git availability before promotion.
- A controlled full-history mirror succeeds after an App Service recycle.
- Duplicate and retried messages cannot overwrite an unrelated repository.
- Queue or worker failures become durable, sanitized, retryable states.
- Existing same-organization and local-only app flows continue to work.
- Existing onboarding, audit, notification, and preparation behavior remains
  intact.
- The full relevant test suite, production build, Prisma validation, container
  smoke test, Bicep validation, and `git diff --check` pass before rollout.

## Authoritative Azure References

- [Jobs in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/jobs)
- [Managed identities in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity)
- [Manage secrets in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets)
- [Azure Container Apps image pull from Azure Container Registry with managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull)
