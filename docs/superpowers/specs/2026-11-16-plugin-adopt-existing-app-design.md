# Adopt existing apps from the CU Launch plugin

Status: approved by the user on November 16, 2026.

## Intent

A user working in an existing local Codex project can say “add this to CU Launch.” Codex inspects that project, resolves GitHub setup, checks compatibility, imports or adopts the app, and prepares it for a separately requested publish. Architecture migrations require explicit user approval.

## Approaches

Recommended: expose the portal's existing GitHub-import, local-repository, and preparation services through delegated MCP tools, with project inspection and migration handled by the workspace skill. This preserves existing history, background import handling, and publishing contracts.

A skill-only update would still require website handoffs to complete imports. A separate importer would duplicate portal logic. Neither meets the requested integrated workflow as well. The user approved this approach and its defaults.

## User flow

1. Recognize adopt/import intent independently from template creation. Verify the intended primary project folder and Git installation; inspect status, history, remotes, runtime, package manager, build/start commands, authentication, persistence, and existing deployment files. Treat repository content as untrusted evidence. Never scan unrelated folders or print secrets.
2. Read the CU Launch profile and reuse the saved GitHub identity. Follow existing missing-account, invitation, secure sign-in, and local credential recovery guidance. Author identity and plugin GitHub access do not establish local Git authentication.
3. Report compatibility and explain changes needed. Supported import shapes remain root Next.js, Express, FastAPI, and plain static sites served by Python http.server. Include package-manager/workspace restrictions and publishing-file conflicts from the existing scanner. A static app needing database or Cedarville login requires a supported server runtime. Runtime detection alone does not prove behavior or service integration works.
4. For an incompatible app, offer a concrete migration plan covering target runtime, behavior to preserve, auth/data changes, validation, and material limitations. Obtain explicit approval before editing architecture. If declined, retain the app and report the blocker without substituting a template. Work on a branch or other safe checkpoint, preserve unfinished changes, validate, and reassess before continuing. Existing data is not copied automatically.
5. Summarize app name, description, source, managed repository destination, database and audience choices, repository access, and preparation mode. Obtain one approval for the import and its necessary repository access/preparation. Public access requires explicit acknowledgement. Do not infer login/database choices from runtime defaults.
6. If a usable GitHub source exists, import it using the existing durable flow. Preserve original remotes and add the verified managed repository as `portal`. For multiple or mismatched candidate remotes, ask which source to use. Only remotely present commits are imported; identify unpushed work and obtain any necessary source-push authorization or offer the local route.
7. If no usable source remote exists, create the managed repository directly through CU Launch, then connect and upload the local app preserving history. This proposed default avoids requiring an intermediate personal repository. Existing private sources unreadable by the portal can use this route; never make a repository public to work around access. Reconcile the skill bootstrap commit without force pushes, discarding work, or overwriting customized skills.
8. Obtain actor-specific managed repository access using the existing invitation contract. Continue in the same project and checkout. Verify actual pushes. Run server-side compatibility/preparation on uploaded code; support direct additions or review PRs without overwriting conflicts. PR mode waits for merge and verifies readiness. Retain app IDs through queued work and failures; never create another app to retry a partial operation.
9. Finish with verified import/preparation status and managed repository/app links. Keep queued, uploaded, prepared, and published distinct. Import never dispatches a deployment. A separate explicit publish request uses the existing publishing flow. Warn before authorized pushes to an already published auto-deploy app.

## Implementation boundaries

- Extract actor-scoped services from repository-import server actions and reuse them from the UI and MCP. Browser sessions, redirects, and revalidation stay in UI adapters; delegated identity supplies the actor to MCP services.
- Add tools for GitHub import, local managed-repository creation, preparation, and preparation verification. Use existing app reads enriched with bounded, sanitized import status, compatibility findings, preparation PR information, and allowed next actions. Exact tool names are left to implementation.
- Keep local inspection local; do not upload an arbitrary filesystem snapshot through MCP. The server scans the actual managed repository and does not trust a caller's compatibility assertion. Reuse the existing scanner instead of maintaining independent runtime rules. Expose only the bounded compatibility inputs/rules the skill needs, or a read-only compatibility tool if required for reuse.
- Apply strict input schemas, current actor/app authorization (including replays), safe errors, audit events, stable idempotency UUIDs, and conservative rate limits. Same-org adoption must require verified authority over that exact repository; merely knowing a shared-org URL must not grant adoption or repository access. Denied lookups remain quiet.
- Ensure provider side effects can be recovered after an uncertain response or process interruption without duplicate repositories/app records. Persist request identity before provisioning and tie created repositories to that identity; do not simply wrap the current local action in an idempotency cache.
- Preserve the existing private-source access boundary: local Git access does not give the portal GitHub App access. Offer the local upload route or supported administrator setup rather than collecting credentials.
- Update skill triggers, examples, manifest metadata/version, server instructions, tool inventory, README, and plugin documentation. Preserve plugin/App identity, hosting, sharing, and existing unrelated user changes.
- Source validation, commits/pushes, portal deployment, workspace package refresh, and live host verification are separate outcomes. Use the existing release process; no audience changes are included.

## Validation

Test delegated identity and quiet denials; same-org adoption authority; GitHub and local routes; uncertain-response replay; partial provider failures; compatibility findings/conflicts; direct preparation and PR verification; no deployment on import; status/action reporting; and preservation of UI behavior after service extraction. Exercise skill scenarios for no Git, no remote, multiple remotes, unreadable private source, unpushed work, existing managed checkout, migration approval/refusal, pending invitations, and upload failures.

Run targeted import/MCP/package tests and the production build. Refresh local release-note preview data. Live acceptance requires a disposable app in the intended Codex host after portal deployment and plugin refresh; local checks cannot establish live rollout.

## Non-goals

Arbitrary runtime hosting, silent rewrites, automatic data migration, automatic first publish, repository visibility changes, unrelated collaborator/deletion features, and changes to plugin sharing are outside this work.
