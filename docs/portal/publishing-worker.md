# Durable publishing and administrative recovery

Publishing is executed by a separate worker, not by an untracked promise in Next.js. The web process records the requesting actor and a queued PublishAttempt in one transaction, then sends the attempt ID to Service Bus. A committed queued attempt is also an outbox entry: the recovery job redelivers it if sending or receiving was interrupted. A queue-send timeout never rolls the claim back, because the broker may already have accepted the message.

## Worker and recovery behavior

The event-triggered Azure Container Apps Job consumes the `publishing` queue. Its database lease lasts two minutes and renews every 20 seconds. Progress and terminal updates check the lease token and the latest attempt before updating either record. The original actor's app access and repository preparation are rechecked before provider mutations. Lost or replaced leases prevent a late worker from rewriting recovery results.

The dispatch marker is persisted before calling GitHub. After a workflow run is recorded, redelivery inspects that run rather than dispatching another workflow. If a crash occurs between dispatch and recording the run ID, recovery requires administrator review; it never guesses that an older healthy deployment belongs to the interrupted attempt.

The scheduled recovery job runs every five minutes. It redelivers stranded queued attempts and safely resumable infrastructure work, checks recorded workflows, and verifies exactly `GET /api/health` with redirects disabled and a 30-second timeout. GitHub success and a current HTTP 200 health response are both required to record recovered success. Running GitHub workflows remain pending. Failed workflows are recorded as failed. A successful workflow whose app remains unhealthy is given up to two hours from the attempt start to finish startup before recovery records failure. Legacy running attempts without leases must be at least 30 minutes old; new queued outbox entries can be recovered after five minutes.

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
4. The worker needs the same GitHub installation and publishing target configuration as the portal. Grant its managed identity Microsoft Graph `Application.ReadWrite.OwnedBy`, administrator consent, and ownership of the shared managed app registration. Azure Contributor and constrained Role Based Access Control Administrator assignments in the template allow only Key Vault Secrets User and Website Contributor grants. The deployment identity receives Contributor access only on the two new jobs; its existing ACR push role is reused.
5. Ensure the worker can reach the PostgreSQL database, GitHub, Azure APIs, the configured SMTP server, and app health endpoints. Use the same database endpoint/vault credential and network routing as the import worker.
6. Start the recovery job once and inspect its logs. Deploy the portal with `PUBLISH_TRANSPORT=service-bus`, `PUBLISH_SERVICE_BUS_NAMESPACE=<namespace>.servicebus.windows.net`, and `PUBLISH_SERVICE_BUS_QUEUE=publishing`. Until those settings exist, production publishing fails closed with an unavailable message.
7. Queue a controlled publish and verify its database heartbeat, recorded workflow, terminal status, and health result. Restart the portal during that publish to confirm that the separate job continues. Test recovery by terminating a job after it has recorded the GitHub run and confirming that recovery settles the existing attempt without another dispatch.

The `Deploy Publishing Worker` GitHub workflow builds and smoke-tests the image, scans it, pushes an immutable image, and updates both jobs by digest. It expects the infrastructure and schema migration to exist; it does not create infrastructure or apply database migrations.

Existing stranded records such as FRED App can be recovered through the new admin action or the scheduled recovery job after rollout. Local implementation and tests do not update those live records.
