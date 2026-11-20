# Durable publishing and administrative recovery

Publishing is executed by a separate worker, not by an untracked promise in Next.js. The web process records the requesting actor and a queued PublishAttempt in one transaction, then sends the attempt ID to Service Bus. A committed queued attempt is also an outbox entry: the recovery job redelivers it if sending or receiving was interrupted. A queue-send timeout never rolls the claim back, because the broker may already have accepted the message.

Guarded progress writes always update the attempt heartbeat, including when only app resource details change. An empty Prisma `updateMany` returns zero updates and must not be used to check worker ownership. A worker repeatedly logging provisioning completion followed by “no longer owns this attempt” before deployment can indicate this bug in an older image; deploy the corrected image and let recovery redeliver the existing attempt.

## Worker and recovery behavior

The event-triggered Azure Container Apps Job consumes the `publishing` queue. Its database lease lasts two minutes and renews every 20 seconds. Progress and terminal updates check the lease token and the latest attempt before updating either record. The original actor's app access and repository preparation are rechecked before provider mutations. Lost or replaced leases prevent a late worker from rewriting recovery results.

The dispatch marker is persisted before calling GitHub. Dispatch requests `return_run_details: true`; the exact run ID and URL returned by GitHub are saved through a fenced, awaited progress write before workflow completion is checked. This avoids relying on eventual consistency in the workflow run list. If GitHub returns the legacy 204 response, discovery makes up to 60 read-only checks two seconds apart without redispatching. After a workflow run is recorded, redelivery inspects that run rather than dispatching another workflow. If a crash occurs between dispatch and recording the run ID, recovery requires administrator review; it never guesses that an older healthy deployment belongs to the interrupted attempt.

The scheduled recovery job runs every five minutes. It redelivers stranded queued attempts and safely resumable infrastructure work, checks recorded workflows, and verifies `GET /api/health`. If that probe fails, it checks `GET /`. Both probes disable redirects and use separate 30-second timeouts. GitHub success and a current HTTP 200 from either endpoint are required to record recovered success. A root-only success saves `publishWarningSummary` and displays the app as published with a warning on My Apps, onboarding, and app details. HTTP 404/410 health responses are described as a missing health path; other failures are described by status or reachability. A later publish with a healthy `/api/health` clears the warning. Running GitHub workflows remain pending. Failed workflows are recorded as failed. A successful workflow whose app remains unhealthy is given up to two hours from the attempt start to finish startup before recovery records failure. Legacy running attempts without leases must be at least 30 minutes old; new queued outbox entries can be recovered after five minutes.

## Administrator controls

Recovery also handles legacy cases where an attempt was recorded as finished before its app status was updated. A successful terminal attempt is checked against GitHub and health again before updating the stranded app. Its original completion time is preserved.

Open **Admin → Apps → the app → Publishing recovery**. This displays the latest attempt, stage, heartbeat, lease expiry, support reference, and recorded deployment link.

- **Check and recover publishing** performs the GitHub and health checks and closes a stranded attempt when evidence supports success or failure.
- **End an abandoned publish as failed** requires a reason and confirmation that the worker and deployment have stopped. A recorded GitHub workflow that is still running cannot be closed by this action.
- **Mark publishing setup as needing repair** resets stale CHECKING/REPAIRING state or flags ready setup for repair. A setup operation less than 30 minutes old cannot be reset. The published app remains available; Repair Publishing Setup can refresh its prerequisites afterward.
- **Clear old publishing error notes** clears diagnostic notes for a settled app.

Every correction checks administrator authorization on the server. Running publishes block setup and note corrections. State corrections use compare-and-set updates, and reconciliation uses a database transaction for the attempt and app together. Corrections record an audit event with the actor, app, support reference, and reason. There is no arbitrary table editor or unchecked “mark published” control.

## Local development

The default development transport is `database`. Keep the portal running in one terminal and run this in a second terminal:

```sh
npm run publish:worker
```

The separate process polls queued database attempts every five seconds and also performs recovery. To run only one recovery pass:

```sh
npm run publish:recover
```

Production rejects the database transport. There is no inline publishing fallback.

## Azure rollout

1. Apply the Prisma migration with `npm run prisma:migrate:deploy` against the portal database before deploying the new portal or worker.
2. Build and push the immutable `workers/publish/Dockerfile` image to the existing worker ACR. `npm run build:publish-worker` builds its standalone entry point.
3. Deploy `infra/publish-worker/main.bicep` in the existing import worker hosting resource group. Set `publishingResourceGroupName` to the configured managed-app target group, which may be different; Azure publishing permissions are assigned there through a separate module. Reuse the repository-import Service Bus namespace, Container Apps environment, ACR, pull identity, and secret vault. Pass a content digest, the portal principal ID, and the GitHub deployment principal ID. Populate the referenced vault secrets before creating the jobs. See the parameter example in that directory.
4. The worker needs the same GitHub installation and publishing target configuration as the portal. Grant its managed identity Microsoft Graph `Application.ReadWrite.OwnedBy`, administrator consent, and ownership of the shared managed app registration. The template grants Contributor and Key Vault Secrets Officer on the publish resource group so the worker can create app vaults and write managed database/authentication secrets. Its constrained Role Based Access Control Administrator assignment allows only Key Vault Secrets User and Website Contributor grants. The deployment identity receives Contributor access only on the two new jobs; its existing ACR push role is reused.
5. Ensure the worker can reach the PostgreSQL database, GitHub, Azure APIs, the configured SMTP server, and app health endpoints. Use the same database endpoint/vault credential and network routing as the import worker.
6. Start the recovery job once and inspect its logs. Deploy the portal with `PUBLISH_TRANSPORT=service-bus`, `PUBLISH_SERVICE_BUS_NAMESPACE=<namespace>.servicebus.windows.net`, and `PUBLISH_SERVICE_BUS_QUEUE=publishing`. Until those settings exist, production publishing fails closed with an unavailable message.
7. Queue a controlled publish and verify its database heartbeat, recorded workflow, terminal status, and health result. Restart the portal during that publish to confirm that the separate job continues. Test recovery by terminating a job after it has recorded the GitHub run and confirming that recovery settles the existing attempt without another dispatch.

The `Deploy Publishing Worker` GitHub workflow builds and smoke-tests the image, scans it, pushes an immutable image, and updates both jobs by digest. It expects the infrastructure and schema migration to exist; it does not create infrastructure or apply database migrations.

Existing stranded records such as FRED App can be recovered through the new admin action or the scheduled recovery job after rollout. Local implementation and tests do not update those live records.

The health-fallback change requires migration `20261019180000_publish_health_warning` before deploying either the portal or publishing worker. Active interrupted attempts use the fallback during recovery. Settled failed attempts can now be reconciled by the app health service described below.

Managed-credential Key Vault rollout requires applying the updated infrastructure permissions as well as deploying the portal and worker images. Then run Repair Publishing Setup for existing apps; see [the migration runbook](technical-operations.md#migrating-managed-credentials-to-key-vault). An image-only workflow update does not grant Key Vault Secrets Officer.


## App health checks

App management and eligible failed-publishing onboarding pages offer **Check Health** to owners, collaborators and administrators. It checks the provisioned Azure default hostname immediately and refreshes the displayed availability and last-check time. It never queues publishing, dispatches a workflow, changes repository files, repairs settings or restarts an app. Current availability is separate from publishing history: an endpoint outage records unhealthy availability without turning a successful publish into a failed one.

The existing five-minute recovery job also scans due apps. Apps with no observation, warnings or unhealthy results are due every five minutes. Once an app is healthy, its next scheduled check is due two hours later. Manual checks run immediately regardless of this interval. The schedule processes up to 20 apps per pass with four concurrent checks, ordered by the oldest observation first. Larger fleets or slow runs can take additional passes; these are target intervals, not exact deadlines. Queued and active publishes, deleted deployments, and apps without a provisioned Web App are skipped. Failed endpoint checks save their observation timestamp so they do not block the rest of the fleet.

Ordinary apps require HTTP 200 from `/api/health`, with a warning fallback when only `/` responds with HTTP 200. Each request disables redirects and has a five-second timeout. MCP servers require health, matching OAuth discovery and the anonymous authentication challenge; periodic checks make one probe pass rather than retrying startup. This does not verify an authenticated MCP host connection or tool execution.

For a settled failed publish, health checks also read its recorded GitHub run. When that same run now reports completed/success and the app passes verification, the service updates the latest attempt and app to succeeded together, clears the old publish error, retains applicable publishing warnings and records `PUBLISH_RECOVERED`. The verification observation has a new timestamp; existing publishing completion timestamps are preserved. When the recorded run is not successful, the service also checks the latest run of the managed deployment workflow on the default branch. A later completed/successful run must have the expected workflow path, start after the failed attempt began, and match the current default-branch commit. With passing health verification, this creates a separate observed-success attempt and updates the app to succeeded; the original failed attempt is preserved. The new observation records verification time without inventing a deployment completion time. An unrelated newer run, stale commit, missing provenance, or a healthy older deployment alone cannot establish recovery. If GitHub is unavailable or evidence is missing, availability is recorded with an explanation and publishing history stays unchanged. No notification is sent on each periodic check.

Persistence uses a serializable transaction, the observed app version, a monotonically incrementing health-check version, and the latest attempt identity/status. Deployment changes or overlapping checks discard stale observations. Per-app failures are isolated and logged without exposing provider response bodies.

Rollout requires migration `20261119180000_app_health_checks` before deploying **both** the portal and publishing worker image. The existing Azure job schedule remains `*/5 * * * *`. `npm run publish:recover` includes the due health scan, and the local database worker also performs scans. The worker needs outbound HTTPS access to the managed app endpoints and GitHub. After deployment, use Arkanoid's **Check Health** action and verify its saved health observation and any recovered run in the audit log; local tests do not update live app records.

## Automatic rollout verification

Both worker workflows call `scripts/workers/deploy-with-portal-smtp.mjs`. It uses the existing GitHub OIDC identity and a versioned ARM PATCH rather than `az containerapp job update --yaml`. The latter performs an extra model/secret round-trip that can fail before sending a job update. Keep Key Vault-backed secrets as `keyVaultUrl`/`identity` references; do not hydrate them into literal values. Existing unrelated literal secrets and job configuration are preserved. SMTP values travel only in a private temporary request file, which is removed even after failure.

After Azure reports the resource updated, the helper reads back the image, commit environment, and SMTP secret references. A mismatch fails the workflow. Error output includes only structured Azure error codes, never provider response bodies containing credentials. Verify automatic publishing **and** recovery jobs plus the repository-import job against the workflow commit; a successful image build or registry push is not a completed rollout.

The PATCH intentionally omits the unchanged top-level `identity` block. Reassigning those identities requires `Microsoft.ManagedIdentity/userAssignedIdentities/assign/action`, which is outside the existing job-scoped CI role. Routine rollouts preserve the current assignments without requesting that permission.
