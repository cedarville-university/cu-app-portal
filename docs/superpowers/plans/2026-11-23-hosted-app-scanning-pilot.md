# Hosted app scanning pilot

**First deliverable.** Give CU Launch administrators a repeatable, read-only inventory of managed Azure Web Apps, their portal owners, and the evidence identifying the version each app runs. That inventory supplies the denominator for security, dependency, data protection, and design reviews.

GitHub supplies repository checks and dependency updates. Azure supplies hosting and protection evidence. CU Launch joins them by app request ID and assigns follow-up. Start with a one-shot report that can run locally against fixtures. Add a schedule once the pilot demonstrates what the report can verify. [Shared design](https://chatgpt.com/s/cx_6b0487fc43888191b96e88b46f8acce5)

**Pilot executed on November 23.** The repeatable inventory, eight-app deployment review, and testing-slot baseline and fix are documented in the [pilot results and runbook](../../portal/hosted-app-scanning-pilot.md). The fleet counts below are the earlier planning snapshot.

## Starting inventory · November 23, 2026

I read every page returned by CU Launch `admin_list_apps` and listed App Service Web Apps in `rg-cu-apps-published`. I joined the Azure tags `managedBy=cu-app-portal` and `appRequestId` to the portal app ID. The design’s November 20 snapshot had 59 registrations and 39 recorded URLs.

| Observation | Count | What to do with it |
| --- | ---: | --- |
| CU Launch registrations | 61 | Start with all registrations, including failed and unfinished publishes. |
| Registrations with a recorded URL | 41 | Each has an owner ID, a repository URL, and exactly one tagged Azure Web App. |
| Matched Web Apps with Azure state `Running` | 41 | Record reachability and deployed revision separately. Both still need evidence. |
| Matched registrations by portal publish status | 39 succeeded, 2 not started | Trace the two status discrepancies in deployment history. |
| Registrations with neither a URL nor a matched Web App | 20 | Keep visible as registrations without hosting evidence in this group. |
| Tagged Web Apps in the group | 43 | Two request IDs have no matching portal registration. Assign CU Launch operations to establish ownership. |

The matched set contains 26 records marked `PORTAL_MANAGED_REPO` and 15 marked `IMPORTED_REPOSITORY`. The counts describe one resource group at collection time. App names, owner contact details, and provider evidence belong in the restricted operator report.

## 1. Make the inventory reproducible

**First PR.** Add `scripts/hosted-apps/inventory.ts` and an adjacent `inventory.test.ts`. Build a one-shot TypeScript CLI that takes two metadata exports and writes deterministic JSON to stdout. This lets an engineer test the join without production credentials or a database migration.

- [x] Capture the portal input by following `admin_list_apps.nextOffset` to null. Project app ID, owner ID, repository URL, source of truth, publish status, and whether a live URL is recorded. Record collection time, scope, and whether each source completed. The existing admin query defines the URL fallback and pagination. [Portal query](../../../src/features/portal-mcp/admin/queries.ts)
- [x] Capture the Azure input with the command below. The ownership tag pair comes from the publishing code. List the whole group so partially tagged resources stay visible for review. [Azure tag contract](../../../src/features/publishing/azure/naming.ts)

  ```sh
  az webapp list --resource-group rg-cu-apps-published \
    --query '[].{resourceId:id,manager:tags.managedBy,requestId:tags.appRequestId,state:state}' \
    --output json
  ```

- [x] Full-outer-join managed resources and registrations on the exact request ID. Emit matched, portal-only, Azure-only, and ambiguous rows. List sites with incomplete ownership tags separately. Keep unknown ownership separate from confirmed non-CU resources. Record missing owners and repositories. Deduplicate repeated input records by source ID and retain distinct resource IDs claiming the same app. A missing page or denied provider read makes the run incomplete and prevents a definitive “missing resource” result.
- [x] Exercise the normal CLI entry point with synthetic exports. Cover a running site with a `NOT_STARTED` portal status, a failed publish with a site but no URL, two sites claiming one ID, an Azure-only ID, a missing owner, and a partial read. Run `npm test -- scripts/hosted-apps/inventory.test.ts`. Acceptance is one traceable row per registration or unmatched resource and the same counts on replay. The November 23 counts are a dated comparison point.

  The first PR should support this invocation.

  ```sh
  node --import tsx scripts/hosted-apps/inventory.ts --portal portal.json --azure azure.json
  ```

## 2. Identify the deployed revision for six to eight pilot apps

- [x] CU Launch operations picks six to eight matched apps spanning generated and imported code, public and Entra sign-in, PostgreSQL and no database, and portal-dispatch and push-to-deploy. Include Next.js and Express sign-in if available. Record the request ID, accountable owner, verified framework and hosting target for each selection. Track the unmatched sites separately until their owners are known. [Portal data model](../../../prisma/schema.prisma)
- [x] Record the portal’s most recent health result and observation time separately from Azure’s resource state. When the observation is missing or stale, record a reachability gap until the existing health worker checks the app again. [App health checks](../../../src/features/publishing/app-health.ts)
- [x] For each app, capture a successful deployment to the matched Azure target, the deployment time, the managed repository, and the **actual checked-out commit or artifact digest**. Use the recorded workflow run ID for portal dispatch. Also look for subsequent push-triggered deployments and reruns. A branch tip, a health response, or a successful workflow on its own is insufficient to identify the active package after a rollback or out-of-band deployment. Record an explicit unknown and the missing evidence when the chain breaks. [Workflow selection](../../../src/features/publishing/workflow-triggers.ts) · [Publish attempt fields](../../../prisma/schema.prisma)
- [x] Include a fixture in which an imported app’s first publish checks out `cu_launch_commit_sha` and the workflow run has a different head SHA. Verify the report uses the reviewed checkout when deployment evidence confirms it. Also test a later push without a portal attempt and an ambiguous rollback. [Imported workflow generation](../../../src/features/repository-imports/publishing-bundle.ts)
- [x] Confirm which private-repository dependency, code, and secret alerts the pilot reader can access and which Azure resource metadata it can read. Record unavailable coverage with the reason. If licensing leaves a gap, try a self-managed scanner on a pilot fixture using the same report fields. Keep the collector read-only and scope it to managed repositories and the publishing group. Use a separate identity for future dependency PRs.

## 3. Prove one check in each review area

| Review | Pilot proof |
| --- | --- |
| Dependencies | Correlate a known advisory in a fixture lockfile to a deployed revision. Track routine grouped patch/minor updates separately from security findings and major upgrades. |
| Security | Verify a synthetic secret finding and an access-control regression using isolated fixtures and existing staging tests. Retain only rule, location, revision, owner, and a restricted evidence link. |
| Sensitive data | On an approved test store with synthetic records, pair the classification with its access, encryption and retention settings. Record a protection gap when a control fails and a coverage gap when evidence is unavailable. |
| Design | Use the October 28 Cedarville login recommendation as the first versioned rule. For deployed Entra Next.js apps, verify the branded public page and server-side Auth.js initiation. For Express, verify its existing OIDC flow and CSRF-protected login initiation. Check protected pages and APIs, safe return destinations, and the registered callback. Track live Entra and Chrome verification separately. A dismissed notice or a template version supplies no deployed-code evidence. Include applicable newer imports and mark public apps inapplicable. [Login guidance](../../portal/template-authoring.md#cedarville-login-pages) |

- [x] For every applicable check, record rule version, deployed revision, time, outcome, and owner. Distinguish a pass, an actionable finding, a coverage gap, and a check that does not apply. Deduplicate repeat findings by app, rule, and affected component. Keep secret values, student records, and raw logs out of reports and tickets.
- [ ] Route confirmed credential or sensitive-data exposure through IT Security’s incident process. App owners handle app code and dependencies. CU Launch handles shared infrastructure and unmatched resources. An exception records its owner, rationale and expiry. Verify closure against the deployed fix.

**Ready to expand when** all pilot apps have a verified owner and deployment identity, each applicable check has a current result or an explicit coverage gap, and one synthetic finding has been followed through a verified deployed fix. Then schedule inventory nightly and on deployment, add a weekly deployed-version sweep, and introduce PR gates only for checks the pilot proves reliable. Keep remediation merges reviewed because a default-branch merge can publish an app.
