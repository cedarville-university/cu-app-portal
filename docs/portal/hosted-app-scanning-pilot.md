# Hosted app scanning pilot

CU Launch operations can reconcile portal registrations with Azure Web Apps and review evidence for six to eight selected apps. Run the collector locally with existing read access. Keep the resulting JSON in a private directory. The fixture runner on the portal testing slot needs only synthetic inputs.

## Capture and review

1. Set `PILOT_PORTAL_URL` to the canonical CU Launch HTTPS endpoint ending in `/api/mcp`. Supply an existing delegated portal admin read token through `CU_LAUNCH_PILOT_READ_TOKEN`. Sign in to Azure CLI with inventory access to the publishing group and to GitHub CLI with read access to the selected managed repositories. Azure deployment history also requires access to deployment metadata. Run from the repository root.

   ```sh
   umask 077
   mkdir -p tmp/hosted-apps-pilot
   pilot_dir=$(mktemp -d tmp/hosted-apps-pilot/run.XXXXXXXX)
   node --import tsx scripts/hosted-apps/capture-inventory.ts \
     --portal-url "$PILOT_PORTAL_URL" --out "$pilot_dir/snapshots"
   node --import tsx scripts/hosted-apps/inventory.ts \
     --portal "$pilot_dir/snapshots/portal.json" --azure "$pilot_dir/snapshots/azure.json" \
     > "$pilot_dir/inventory.json"
   ```

   Each snapshot has `scope`, `collectedAt`, `complete`, and `rows`. Operators using the connected admin tool can also project its pages into the portal snapshot. Follow `nextOffset` through the last page, preserve missing values, and exclude email, names, raw configuration, and diagnostics. An incomplete snapshot produces exit code 2 and provisional rows. An invalid input or conflicting duplicate produces exit code 1. The inventory CLI is deterministic for a given pair of files.

2. Run the report with access to the CU Launch database for the same environment as the inventory. Set `DATABASE_URL` in the reporting process. The pilot saves eligible security reviews automatically when it processes evidence.

   Save the selected matched registration IDs in `$pilot_dir/cohort.json` as objects in an array. For example, an entry can be `{"id":"request-id","workflowUrl":"https://github.com/ORG/REPO/actions/runs/123"}`. The recorded portal workflow URL is optional. Choose across app origin, audience, framework, database use, and deployment mode.

   ```sh
   python3 scripts/hosted-apps/collect-evidence.py \
     --inventory "$pilot_dir/inventory.json" --cohort "$pilot_dir/cohort.json" > "$pilot_dir/evidence.json"
   node --import tsx scripts/hosted-apps/inventory.ts \
     --portal "$pilot_dir/snapshots/portal.json" --azure "$pilot_dir/snapshots/azure.json" \
     --evidence "$pilot_dir/evidence.json" > "$pilot_dir/report.json"
   ```

3. Inspect each app’s active deployment, revision, health observation, checks, and gaps. The reader matches the ID in Azure’s active successful deployment to the deploy job’s provider receipt and extracts the actual checkout SHA. It checks up to 30 recent managed workflow runs and the recorded portal run. A rollback, missing logs, an ambiguous receipt, or a different repository leaves the revision unknown. The profile describes the manifest at that commit and the trigger of that deployment. The portal’s saved trigger mode, when available, is a separate field.

4. The dependency pilot checks the root npm v2/v3 lockfile at the deployed revision for the specified lodash advisory, including nested installations. The report names that component and advisory. Provider alert access is a separate observation. Scope each human-reviewed control result to its resource, revision, component, time, and restricted evidence reference. The report accepts current observations from the last seven days. For a public app or unsupported login framework, review the deployed entry points and identify that source in the profile’s `loginExemptionEvidence` before exempting the app. Record coverage gaps for missing or expired evidence. The schema and fixtures show the accepted controls for each rule. [Evidence schema](../../scripts/hosted-apps/review.ts) · [GitHub advisory](https://github.com/advisories/GHSA-35jh-r3h4-6jhm)

5. Add `--previous prior-report.json` on the next review to carry open findings across missing observations and verify fixes on a different deployed revision. Route confirmed exposures through IT Security, app work to the registered owner, and unresolved ownership or infrastructure issues to CU Launch. An optional per-app `exceptions` entry records rule, component, owner ID, rationale and expiry. An exception keeps the underlying finding visible. Use reviewed PRs for remediation.

## Dependabot and the Slide Show-Inator source scan

From the CU Launch repository root, enable Dependabot for an individual managed repository and verify its alert feed with the CU Launch installation identity. The enable operation also turns on GitHub's dependency graph. It verifies the setting after the write. Reads request a separate token scoped to the repository with read-only Dependabot alert access. An installation owner approves this permission in GitHub. The pilot collector uses this reader when it assembles reports.

```sh
node --import tsx scripts/hosted-apps/dependabot.ts enable cu-app-portal-repos/slide-show-inator
node --import tsx scripts/hosted-apps/dependabot.ts read cu-app-portal-repos/slide-show-inator
```

Use the app's Semgrep workflow receipt or run its scanner locally against the full deployed Git commit. The scanner reads tracked JavaScript and TypeScript and pinned community rules. The receipt records both inputs, file coverage, errors and finding locations. [Slide Show-Inator scanner and workflow](https://github.com/cu-app-portal-repos/slide-show-inator/pull/1)

For a single-app rerun, place that registration and the deployment workflow URL in a one-entry cohort file. Add `--semgrep /private/path/semgrep.json` to the evidence collector command above. The report attaches the receipt only when its repository and commit match the active Azure deployment and the evidence is current. A pull request receipt can refer to GitHub's temporary merge commit. Dependabot reports open alerts from the repository's default branch separately from deployed-code checks. Confirm the deployment's resolved packages when assessing runtime exposure.

## Repeat the local and testing-slot checks

```sh
npm test -- scripts/hosted-apps/inventory.test.ts
python3 scripts/hosted-apps/test_collect_evidence.py
node_modules/.bin/esbuild scripts/hosted-apps/fixture-smoke.ts scripts/hosted-apps/inventory.ts \
  --bundle --platform=node --target=node24 --external:@prisma/client --outdir="$pilot_dir/bundles" --out-extension:.js=.cjs
python3 scripts/hosted-apps/test-slot.py "$pilot_dir/bundles" "$pilot_dir/slot-results"
```

The slot runner checks the exact testing hostname and auto-swap setting, uploads to a unique private directory under `/home/site`, and runs Node in the app container. It verifies a CLI replay and hashes the deployed synthetic fixture before evaluating it. It replaces the baseline with the fixed fixture at the same path and reads the completed report back. Only the two bundles and synthetic data go to the slot. The local `slot.json` records the remote directory, run ID, replay result and number of verified fixes.

## November 23 pilot results

| Evidence | Result |
| --- | --- |
| Fleet inventory | 62 portal registrations, 41 matched Web Apps, 21 portal-only registrations, zero unmatched tagged Web Apps in this collection. |
| Eight-app sample | All eight owner IDs and repository names matched Azure tags. Each active Azure deployment matched a successful GitHub job and its checked-out SHA. Four were pushed and four were manually dispatched. The sample covered Next.js, Express and FastAPI, public and Entra audiences, and apps with and without PostgreSQL. |
| Live reviews | Four deployed lockfiles passed the single lodash advisory check. Across 56 review results, 40 were explicit coverage gaps and 12 were inapplicable. The CLI reader could not establish private alert access. The connected GitHub reader supplied the revision evidence. The live portal inventory did not supply health observations. |
| Testing slot | Two identical inventory replays. Five synthetic findings detected and five verified on a replacement artifact. The cases covered a dependency advisory, an inert secret marker, an access-control test result, a synthetic data store policy, and Express login guidance. Live Entra and Chrome verification stayed open. |
| Slot HTTP checks | The health endpoint returned 200 and the anonymous admin page redirected to the slot login page. An obsolete download URL returned 404 and supplied no protected-API evidence. |

Restricted per-app outputs are kept in the local pilot directory. The nightly worker schedule is documented below. The pilot does not enforce a pull-request check. [Pilot plan](../superpowers/plans/2026-11-23-hosted-app-scanning-pilot.md)

## Showing results to an app owner

Each complete evidence run saves eligible results in the selected CU Launch database and writes the JSON report to its normal output. The command reports the number saved on standard error. Inventory-only and provisional runs leave stored reviews alone. Use `--report-only` for an offline replay. The older `--save-security-reviews` option still works.

The portal database must have the app security review migration. If saving fails, the report is still available and the command exits with status 1. Retry with the original inputs and scan dates. This command saves the pilot report. The publishing recovery worker schedules the nightly source scans independently.

On the CU Launch testing slot, operators can also run the installed reporter inside the app container using the slot’s own database connection. Keep the input files and output in a private directory outside the web root.

```sh
NODE_PATH=/home/site/wwwroot/node_modules node /home/site/hosted-apps-pilot/inventory.cjs \
  --portal portal.json --azure azure.json --evidence evidence.json > report.json
```

The importer requires a complete inventory, a matching app registration and repository, and actual scan evidence. A successful scan with zero findings counts. Inventory records, missing checks and failed collection alone do not create a notice. An older report does not replace a newer review for the same repository. The owner sees the scan date and copyable instructions under **Security review** on the access-controlled app details page. **Review the findings** opens three tabs. Dependencies groups alerts by severity, package and advisory and lists the affected files. Source warnings links to the scanned code and records the scanner and rule set when available. Other checks explains recorded findings and checks awaiting evidence. Earlier snapshots still display the detail they contain.

## Nightly repository source scans

The existing five-minute publishing recovery job starts a daily cycle at 07:00 UTC (2 a.m. Eastern standard time or 3 a.m. Eastern daylight time). It checks ready managed GitHub repositories in the configured organizations, including apps awaiting their first deployment. A repository shared by multiple registrations gets one scan. The first check establishes a baseline with the nightly rules, including for apps that already have a deployed-version pilot report. Later checks read the current commit on `main`. A quiet repository uses one GitHub branch lookup and zero scanner runs that night. New apps created after the cutoff enter the next cycle. Missed cycles catch up on the next worker wake-up.

For an evening rollout, set `NIGHTLY_SECURITY_START_AT` on the recovery job to the first intended 07:00 UTC boundary, such as `2026-11-25T07:00:00Z`. This lets publishing recovery and health checks continue before the first scheduled scan. Later wake-ups catch up normally.

The worker runs pinned Semgrep Community Edition and the bundled JavaScript, TypeScript and Python security rules inside Azure. It fetches the exact selected commit with a repository-scoped, read-only installation token. It reads regular source files from Git objects, never runs the app or its scripts, and removes its temporary copy. No repository workflow, GitHub Actions minutes or Actions artifact storage is required. Independently installed GitHub workflows keep their own triggers.

Claims and the last successful commit are durable in `NightlyRepositoryScan`. The worker processes bounded batches. Overlapping wake-ups skip an active claim. A failed or partial scan preserves the last successful result and gets one delayed retry of the same commit before the next nightly cycle. Expired claims can be reclaimed. A complete scan stores its source findings and commit together. A repository with no supported source files records zero coverage. Source warnings in **Security review** link to the scanned main commit. Existing dependency alerts and deployment checks keep their original evidence and dates.

Apply migration `20261125010000_nightly_repository_scan` after the app security review migration and before rolling out the web app and the publishing worker image. The worker image contains the scanner and its pinned rules. The App Service testing slot can exercise the worker against its own database without enabling the production recovery job. For a local source-based worker set `CU_SECURITY_SCANNER_DIR` to a private directory containing `scan.py`, `venv/bin/semgrep` at version 1.186.0 and `rules/` prepared by `workers/publish/security/install-rules.py`. The worker container already provides these at `/opt/cu-security`.

Run `node --env-file=.env --import tsx scripts/hosted-apps/nightly-smoke.ts` against migrated local PostgreSQL to exercise the nightly cutoff, concurrent claims, duplicate registrations, unchanged commits, failed scans and retries in a disposable schema. Add `--live` to check the managed testing-bouncer repository read-only with the installed scanner and confirm that the next night's check skips it. Use `--fixture-script scripts/hosted-apps/nightly-fixture.py` to run real scans across 20 local Git commits in a slot without GitHub credentials.

### Reviewing a Dependabot update

Live update review is available by default for ready app registrations in CU Launch’s managed GitHub installations. In each repository’s GitHub security settings, enable Dependency graph, Dependabot alerts, Dependabot security updates and Grouped security updates. GitHub groups eligible fixes per package manager and manifest directory. The portal reads the association between an open alert and a Dependabot pull request directly from GitHub. The existing pilot receipt also saves these links and the observed checks. Older receipts still work.

In **App details → Security review**, owners can review a proposed update, check the reported tests, open a prepared Codex chat, or copy the instructions. Findings without a linked update keep their own instructions. Applying an update requires a live connection, an owner or administrator, matching revisions, passing checks and a GitHub-ready pull request targeting the registered repository’s default branch. A merge can trigger publishing on apps with automatic publishing enabled.

To limit live review in a particular environment, set `DEPENDABOT_REVIEW_REPOSITORIES` to a comma-separated list of full repository names. An empty list disables live review. Installation access uses repository-scoped tokens for Dependabot alerts, pull requests and contents. When Checks and Commit statuses are unavailable, CU Launch can read GitHub Actions runs and jobs tied to the pull request and its exact commit. A saved report can be reviewed in a slot without the installation credentials. Applying requires contents write access.
