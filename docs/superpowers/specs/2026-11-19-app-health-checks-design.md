# App health checks and deployment reconciliation

Status: Approved by the user, with healthy apps checked every two hours.

## Intent

An app can deploy successfully after its owner reruns a failed GitHub Actions run while CU Launch continues to show failure. Owners need to check the running app without starting another deployment. CU Launch should also check deployed apps periodically.

## Recommended approach

Add a shared health-check service, a **Check Health** action on app management and failed-publishing onboarding, and periodic health checks in the existing five-minute publishing recovery job (healthy apps are due every two hours; other apps every five minutes). Keep current availability separate from the result of a deployment attempt. Recover stale publishing status only when provider evidence and current health support it.

The alternative is to record availability only and leave failed publishing status unchanged. This is simpler but would leave the Arkanoid publishing failure unresolved in the portal. Reusing the existing publish retry or recovery entry point is unsuitable: those paths can enqueue publishing, and recovery currently excludes settled failures.

## User-visible behavior

- Owners, collaborators, and administrators can select **Check Health** for an app with an existing managed Azure deployment address. The action sends requests and reads GitHub evidence; it does not queue publishing, dispatch a workflow, repair settings, restart apps, or change repository files.
- Display current availability and the last check time independently of publishing history: not checked, healthy, warning, or unhealthy. Check failures have a concise diagnostic.
- A current healthy `/api/health` response can clear an earlier availability failure. For compatible imported apps, retain the existing root-response fallback and display a warning if only `/` works.
- If the latest failed publish has a recorded GitHub run which now reports completed/success, and the current endpoint passes verification, reconcile that attempt and the app to success. Preserve the run identity and record recovery in the audit log. A healthy older deployment alone cannot mark a failed attempt successful.
- A running or queued publish is never closed or rewritten by these checks. Its existing worker continues to own publishing progress.
- Temporary endpoint failures change availability, not successful publishing history or setup readiness. A later check can clear them.

## Scheduling and implementation

Use the existing scheduled worker infrastructure, which runs every five minutes. Select eligible apps with managed deployment metadata, including settled failures, in least-recently-checked order. Skip deleted deployments and apps that have never acquired a deployment target. Bound each scan and use limited concurrency so slow endpoints cannot exhaust the recovery job's ten-minute execution window. Persist check timestamps on failures as well as successes to avoid starving other apps. Document that larger fleets may take more than one pass.

Store availability, check time, and a bounded diagnostic on AppRequest through a Prisma migration. Use the same service for manual and scheduled checks. Authorize manual requests server-side using existing app access rules. Derive probe targets from managed deployment metadata, require HTTPS, disable redirects, and use explicit timeouts. Preserve MCP-specific verification requirements rather than treating a generic HTTP response as full MCP readiness.

Perform network requests outside database transactions. Guard persistence against changes to deployment identity and newer publishes while a probe is in flight; update recovered attempt and app records together. Concurrent checks must not let older results overwrite newer observations. Do not fabricate deployment completion timestamps from a periodic health-check time; retain historical timestamps where available.

## Validation and rollout

Cover endpoint success, root-only warnings, timeouts and redirects, unauthorized actions, failed-run rerun recovery, no workflow evidence, active/newer publish protection, overlapping checks, scheduler fairness, and per-app failure isolation. Tests must demonstrate that health checking never sends a publishing queue message or dispatches a GitHub workflow. Run targeted service, action, worker and page tests plus the production build.

Deploy the schema migration before the updated portal and publishing worker. The existing worker schedule needs no new timer or Codex automation. Verify Arkanoid's endpoint and recorded GitHub run after rollout, then use the new action to reconcile its live record. Local implementation does not itself correct that record.

## Choices proposed by Codex

Five-minute cadence, reuse of existing recovery infrastructure, root fallback compatibility, and conservative reconciliation of the recorded GitHub run are proposed defaults. The user approved reconciliation and specified a two-hour interval once healthy. Separate workflows started manually rather than reruns of the recorded run require an explicit provenance policy in future work; do not guess from the latest unrelated run.
