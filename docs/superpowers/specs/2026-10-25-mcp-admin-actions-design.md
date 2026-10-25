# CU Launch MCP ownership and administrative actions

Date: 2026-10-25
Status: Approved and implemented locally on 2026-10-25; not deployed or published

## Intent and agreed scope

`list_my_apps` must list only apps owned by the signed-in actor, including
administrators. Add separate, admin-only actions to list all apps, inspect app
diagnostics, retrieve GitHub and Azure logs for Codex review, and find CU Launch
users. The user selected read-only diagnostics and users already recorded in
CU Launch. Log retrieval is also read-only and admin-only.

## Approaches

Use separate administrative tools, as requested. This makes administrative
discovery explicit and keeps "my apps" consistent for every caller. Reusing
`list_my_apps` with an administrative switch would preserve the ambiguity that
caused the reported problem. A separate MCP server would add connection and
deployment work without improving the existing per-request role checks.

The proposed implementation uses the existing MCP endpoint and portal `ADMIN`
role. The remaining choices below are implementation recommendations for review.

## Tool contracts

### `list_my_apps`

Keep its empty input schema and `{ apps }` response. Query by
`AppRequest.userId === actor.userId`, without an admin override or collaborator
branch. Keep the existing safe app summary, including actor-specific repository
access. Update the description and response text to say "owned apps."

Existing app-detail access for collaborators and administrators remains valid;
this change does not redefine authorization throughout the portal UI.

### `admin_list_apps`

Inputs: optional `query` (trimmed, at most 200 characters), optional `ownerUserId`,
`offset` (integer, default 0), and `limit` (integer, default 25, maximum 100).
Search app names and support references. Both filters apply when supplied.
Order by creation time descending with ID descending as a tie-breaker.

Return `{ apps, nextOffset }`, using one extra row to determine whether another
page exists. Each item contains app ID/name, owner ID/name/email, template,
source type, generation/repository/setup/publishing statuses, repository and
live URLs, creation/update times, and support reference. Return only the selected
fields, without repository-access claims about the administrator.

### `admin_debug_app`

Input: required `appId` (1–128 characters). Return one allowlisted diagnostic
object containing app identity, owner, lifecycle statuses, repository URL/branch,
recorded import/preparation state where present, publishing setup checks, and
the ten most recent publish attempts. Include recorded worker heartbeat/lease
timestamps, workflow links, support reference, and sanitized failure summaries.
Include only explicitly selected diagnostic fields; exclude worker tokens,
environment values, submitted configuration, arbitrary JSON metadata, and raw
provider payloads. Reuse or extract the existing diagnostic redaction helpers
and apply them to every returned free-text failure/check message.

These are recorded diagnostics with their timestamps. The action does not
contact providers, probe health endpoints, refresh checks, reconcile state,
repair, retry, or publish. Distinguish recorded evidence from live validation.
An authorized lookup of a missing app returns the existing safe `NOT_FOUND`.

### `admin_get_app_logs`

Retrieve actual log text for Codex to inspect, with source attribution and safe
links back to the provider. This is separate from `admin_debug_app`, which
returns recorded portal diagnostics. A request for diagnostics alone does not
automatically fetch logs.

Inputs: required `appId` (1–128 characters), optional `attemptId`, `source`
(`github`, `azure`, or `both`, default `both`), Azure `logKind` (`deployment`,
`runtime`, or `both`, default `both`), `maxLines` (integer, default 200, maximum
1,000 per log), and an optional opaque continuation cursor. A supplied attempt
must belong to this app. Without an attempt, use the latest recorded publish
attempt for GitHub; Azure runtime logs describe the app at retrieval time.

- GitHub: Resolve the managed owner/repository and recorded workflow run ID on
  the server. List jobs for that run and retrieve their log text, prioritizing
  failed jobs. Return run/job IDs, names, status/conclusion, source URLs,
  timestamps, and redacted log excerpts. Handle runs still in progress and logs
  that have expired or been deleted. Never substitute the latest unrelated run
  when the selected attempt has no recorded run ID.
- Azure deployment: Resolve the app's configured subscription, stored resource
  group, and Web App on the server. Read deployment records and their available
  log entries through App Service APIs. Include deployment ID, timestamps,
  status, and redacted text. Correlate to the selected attempt where provider
  evidence permits; explicitly label the latest available deployment as
  uncorrelated when no reliable match exists. Do not equate GitHub run IDs with
  Azure deployment IDs.
- Azure runtime: Retrieve available recent App Service container/application
  output through the supported authenticated log interface. Prefer the ARM
  container-log API for the current Linux App Service apps. Label the output
  with collection time and available source timestamps; it is a bounded recent
  snapshot, not a live stream or guaranteed history for a selected attempt.

Return `{ appId, attemptId, collectedAt, sources, nextCursor }`. Each source
reports `available`, `empty`, `not_configured`, `not_ready`, `not_found`,
`forbidden`, `unavailable`, or `unsupported`, with a safe explanation. Successful
entries contain text, source IDs, timestamps, line counts, truncation flags,
and safe provider URLs where available. Return partial results if one provider
fails; do not discard the other provider's logs. A successful transport response
does not mean every requested source was available.

Bound output to 64 KiB of redacted log text per call, at most five GitHub job
logs per call, and bounded provider pagination. Cap downloads at 5 MiB per
upstream response and 10 MiB per call, with a 10-second timeout per request and
30-second overall deadline. Enforce limits while streaming reads rather than
after loading an unbounded body. Mark unavailable or truncated content explicitly;
do not silently describe excerpts as complete logs. Continuation identifies the
same app/source/run/job/deployment and position; validate it and reauthorize on
every call. Mutable runtime snapshots may change between calls and must say so.

Use existing server-held GitHub App installation credentials and Azure identity;
never return credentials, publish profiles, signed download URLs, authorization
headers, or connection strings. Accept no arbitrary URLs, repository names,
resource IDs, paths, or caller-selected credentials. Validate provider-returned
links and redirect destinations against the intended provider hosts; never
forward authentication headers to signed log-download hosts. Prefer plain-text
job logs and JSON deployment logs over extracting archives.

Redact credential patterns before returning text and preserve useful stack
traces, errors, and timestamps. Do not fetch application settings or Key Vault
secrets just to construct a redaction list. Treat log text as untrusted data,
not instructions: plugin guidance must prohibit following commands or requests
embedded in logs. Do not persist log bodies in portal records or audit output.
Collecting logs authorizes no repair, restart, retry, deploy, logging-setting
change, or provider mutation.

Verify the installed GitHub App has Actions read access and that the existing
Azure identity can read the selected app's deployment/runtime logs. These are
deployment prerequisites, not locally verified facts. Missing logging or access
returns the appropriate source status; the tool must not silently enable logging
or broaden credentials. Supporting other telemetry stores such as Log Analytics
or Application Insights is outside this change.

### `admin_find_users`

Inputs: optional `query` (trimmed, at most 200 characters), `offset` (integer,
default 0), and `limit` (integer, default 25, maximum 100). Search display name,
email, and saved GitHub username, case-insensitively. An omitted query lists
users by page. Order by display name, email, and ID for deterministic pagination.

Return `{ users, nextOffset }`. Each user includes ID, display name, email,
`username` derived from the email prefix, and nullable saved `githubUsername`.
Document that `username` is derived: the portal has no independently stored
Cedarville username. Do not call Microsoft Graph or return Entra object IDs.

## Authorization and behavior

All four admin tools are discoverable with descriptions stating that the
portal `ADMIN` role is required. Tool handlers reject non-admin actors with
`FORBIDDEN` before accessing administrative data. Service functions also enforce
this check so invoking them outside the adapter cannot bypass authorization.
Use only the authenticated actor resolved by the server; accept no caller-
supplied role or actor identity. The existing principal resolves the database
admin role on each request, so role removal takes effect on subsequent calls.

Apply the existing shared read rate limit to authorized calls. Use strict input
schemas and the existing safe MCP result/error envelope. Admin tools advertise
`readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: false`.
They perform no application or provider mutations; existing rate-limit bookkeeping
continues. No new delegated MCP scopes or database migration are planned. Log
retrieval may require an administrator to grant narrowly scoped provider read
access if the current credentials lack it; verify this rather than assuming it.

## Implementation and verification

Separate the owner-only listing helper from general access policies. Add admin
query services, provider log-reading methods, and thin MCP adapters, register
the four tools, and update the workspace skill and operator documentation to
describe thirteen tools. Teach the
skill to use admin discovery only for administrative requests and to respect
permission denials. Explain how Codex can use `admin_debug_app` to identify an
attempt and explicitly request `admin_get_app_logs` to review its logs. Keep
existing mutation confirmation and replay rules.

Verify owner filtering for administrators and ordinary users, including exclusion
of collaborator-only apps; admin success and non-admin denial before database
reads; revoked-role behavior at request authentication; pagination/search/input
bounds; absent apps; diagnostic redaction; and excluded fields. Exercise tool
discovery and calls through the real MCP handler as well as the services. Run
targeted tests, relevant authentication checks, and `npm run build`.

For logs, test app/attempt scoping, denial before provider calls, authenticated
provider requests, redirect/token isolation, failed-job prioritization,
redaction, partial provider failure, expired/pending/unconfigured logs, byte and
time limits, continuation validation, and absence of mutation calls. Use mocked
provider responses locally, then perform a separately authorized live read to
verify actual credential access and log availability after deployment.

## Provider references

- [GitHub workflow job and log APIs](https://docs.github.com/en/rest/actions/workflow-jobs):
  job logs, job discovery, GitHub App installation tokens, Actions read permission,
  and short-lived download redirects.
- [Azure App Service deployment logs](https://learn.microsoft.com/en-us/rest/api/appservice/web-apps/list-deployment-log):
  logs scoped to a deployment within a Web App.
- [Azure recent container logs](https://learn.microsoft.com/en-us/rest/api/appservice/web-apps/get-web-site-container-logs):
  authenticated retrieval of recent container output.
- [Azure diagnostic logging](https://learn.microsoft.com/en-us/azure/app-service/troubleshoot-diagnostic-logs):
  available log categories and configuration/storage limitations.

## Delivery boundary

Implementation produces a locally verified change and updated plugin source.
Production deployment, workspace sync, and public plugin submission/publication
are separate operations. Preserve the existing endpoint and real app binding.
After deployment, refresh a private custom connection or verify the applicable
published-tool review state. If distributing changed skills through public
publishing, include them in a reviewed plugin version. Do not infer deployment
or approval from a local build.
