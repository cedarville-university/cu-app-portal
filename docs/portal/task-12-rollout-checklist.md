# Task 12: CU Launch Workspace Plugin Production Rollout

Use this file to continue the administrator-owned CU Launch rollout in a new
Codex chat. It consolidates Task 12 from the implementation plan with the more
granular sequential rollout in `docs/portal/codex-workspace-plugin.md`.

## Current handoff state

- Repository: `/Users/marchollins/projects/cu-app-portal`
- Branch: `main`
- Integrated repository commit: `d0e9f1c` (`fix: secure portal workspace operations`)
- The CU Launch rebrand and plugin security corrections are merged into local
  `main`.
- The three reported security findings were corrected. Per operator direction,
  the security scan was not rerun.
- Previous verification on merged `main`: 1,154 unit tests passed, the production
  build passed, and 3 Playwright end-to-end tests passed.
- The user stated they were ready for sequential rollout Step 6: registering
  the MCP app and capturing its issued `plugin_asdk_app_...` ID. Completion of
  that external step has not yet been reported in this chat.
- Do not treat local tests as evidence that Entra, OpenAI OAuth, workspace
  installation, GitHub creation, Azure publishing, or pilot cleanup succeeded.
- The working tree may contain unrelated user changes. Preserve them and stage
  only the two plugin mapping files named in Task 12 Steps 2-3.

## Non-negotiable rollout rules

- User-facing branding is **CU Launch** and the user-facing action is **launch
  new app**. Preserve internal identifiers such as `cedarville-app-portal`,
  `create_app`, and `/api/mcp`.
- Use individual delegated Cedarville Microsoft Entra identity. Do not use a
  shared identity, app-only token, Auth.js session, or `E2E_AUTH_BYPASS` for MCP.
- Version 1 launches approved template-based new apps only.
- Launching an app must stop before Azure publishing. Publishing, repair, and
  retry require distinct explicit requests.
- Never record client secrets, bearer tokens, authorization codes, or raw
  provider errors in this file, chat, commits, or rollout evidence.
- Do not guess or invent a `plugin_asdk_app_...` ID.
- Do not delete pilot resources without separate, target-specific approval.
- Stop on any identity, authorization, tool-schema, or audit mismatch. Do not
  weaken validation to make the rollout pass.

## Task 12 checklist

### [ ] 1. Verify Entra and OpenAI OAuth end to end

Owners: Entra administrator, OpenAI/Codex administrator, portal operator.

- [ ] Deploy the reviewed portal release and committed migration with
  `PORTAL_MCP_ENABLED=false`.
- [ ] Verify ordinary CU Launch browser sign-in and one low-risk portal read
  while MCP remains disabled.
- [ ] Register or expose the dedicated Entra delegated API resource and scope.
- [ ] Grant the approved tenant consent.
- [ ] Configure the exact MCP tenant, issuer, audience, scope, and resource URL
  settings. Do not reuse browser-session authentication values blindly.
- [ ] Register the exact OpenAI redirect URI shown by the real registration
  flow. Do not invent it or reuse the Auth.js callback.
- [ ] Enable MCP through the normal App Service change process and restart.
- [ ] Verify protected resource metadata.
- [ ] Verify an unauthenticated request to `/api/mcp` receives the expected
  bearer challenge without exposing sensitive details.
- [ ] In ChatGPT developer mode, sign in as an approved Cedarville pilot user.
- [ ] Verify OAuth authorization-code flow, PKCE S256, `resource`, audience,
  delegated `scp`, tenant `tid`, user `oid`, Cedarville email domain, expiry,
  and successful MCP initialization.
- [ ] Verify missing, wrong-tenant, wrong-audience, wrong-scope, app-only,
  expired, and non-Cedarville tokens are denied.
- [ ] Register the MCP connection as **CU Launch**, using the canonical public
  HTTPS endpoint ending in `/api/mcp`.
- [ ] Confirm exactly these nine tools are discovered:
  `list_app_templates`, `list_my_apps`, `create_app`, `get_app`,
  `request_github_access`, `publish_app_to_azure`, `get_publish_status`,
  `repair_publishing_setup`, and `retry_publish`.
- [ ] Capture the issued technical ID beginning with `plugin_asdk_app_` in the
  restricted deployment record.

Evidence record (safe identifiers and references only):

- Change/deployment reference:
- Entra registration reference:
- Consent confirmation reference:
- OAuth test date and pilot role:
- MCP connection registration reference:
- Issued app ID recorded securely: yes / no
- Nine tools confirmed: yes / no
- Negative authorization cases confirmed: yes / no

### [ ] 2. Finalize with the real app ID

Owner: repository operator with access to the restricted deployment record.

- [ ] Start from a clean copy of the intended release commit.
- [ ] Confirm the administrator-issued ID begins with `plugin_asdk_app_`.
- [ ] Set `PORTAL_PLUGIN_APP_ID` only in the operator's secure shell; do not add
  it to this checklist or command logs.
- [ ] Run:

  ```bash
  node scripts/plugins/finalize-portal-plugin.mjs --app-id "$PORTAL_PLUGIN_APP_ID"
  ```

- [ ] Confirm `plugins/cedarville-app-portal/.app.json` contains the actual ID
  and no credential or secret.
- [ ] Confirm
  `plugins/cedarville-app-portal/.codex-plugin/plugin.json` points its `apps`
  field to `./.app.json`.

Evidence record:

- Release commit used:
- Finalizer outcome:
- Mapping manually inspected: yes / no

### [ ] 3. Validate and commit the final connection mapping

Owner: repository operator.

- [ ] Run the plugin package tests, finalizer tests, and skill validation.
- [ ] Run `git diff --check`.
- [ ] Review the diff and confirm only these intended files are included:
  - `plugins/cedarville-app-portal/.app.json`
  - `plugins/cedarville-app-portal/.codex-plugin/plugin.json`
- [ ] Stage only those two files.
- [ ] Commit with:

  ```bash
  git commit -m "chore: connect Cedarville portal MCP app"
  ```

- [ ] Push the reviewed commit through the university's normal repository
  process.

Evidence record:

- Tests and validation:
- Final mapping commit:
- Remote branch or change reference:

### [ ] 4. Publish to the Cedarville workspace pilot

Owner: Cedarville OpenAI/Codex workspace administrator.

- [ ] Import or sync `.agents/plugins/marketplace.json` from the approved
  repository revision.
- [ ] Confirm the marketplace is **Cedarville University**, the plugin is
  **CU Launch**, and the category is **Developer Tools**.
- [ ] Confirm installation policy is `AVAILABLE` and authentication policy is
  `ON_INSTALL`.
- [ ] Assign the plugin only to the approved restricted pilot role or group.
- [ ] Confirm Cedarville authentication occurs during installation.
- [ ] Do not enable the plugin workspace-wide.

Evidence record:

- Marketplace import/sync reference:
- Approved repository revision:
- Pilot role/group reference:
- Installation and authentication result:

### [ ] 5. Run the disposable live-app smoke test

Owners: pilot user, portal operator, GitHub administrator as needed, Azure
operator as needed.

- [ ] Select an approved disposable template.
- [ ] List templates through the plugin.
- [ ] Explicitly launch one private template-based app.
- [ ] Verify the CU Launch portal record.
- [ ] Verify the managed GitHub repository and its private visibility.
- [ ] Request GitHub access through a separate explicit action.
- [ ] Verify the user receives only authorized access.
- [ ] In a later, separate turn, explicitly request Azure publishing.
- [ ] Poll publishing status with bounded polling; do not automatically repair
  or retry.
- [ ] Verify the exact published URL's `/api/health` returns HTTP 200 without
  following redirects.
- [ ] Open the live app and perform its safe smoke check.
- [ ] Verify audit source, actor, authorization, and idempotency records.
- [ ] Exercise one safe recovery denial; do not launch an automatic repair or
  retry.
- [ ] Record the exact disposable targets needed for later cleanup approval.

Evidence record:

- Pilot user or role reference:
- Template ID:
- CU Launch app request ID:
- GitHub repository:
- GitHub access result:
- Publish attempt and workflow run:
- Azure resource and live URL:
- `/api/health` result and timestamp:
- Audit/support references:
- Recovery-denial result:

### [ ] 6. Request separate cleanup approval

Owner: resource owner or administrator authorized to approve deletion.

- [ ] Present the exact disposable CU Launch app record, managed GitHub
  repository, Azure Web App, database, Key Vault resources, and any other
  generated pilot resources.
- [ ] State which deletions are recoverable and which are permanent.
- [ ] Request explicit approval scoped to those exact targets.
- [ ] Do not delete anything under the implementation or rollout authorization.
- [ ] After approval, use the ordinary scoped deletion process and record the
  result. Do not use MCP rollback as a deletion mechanism.

Evidence record:

- Cleanup approval reference:
- Exact approved targets:
- Cleanup operator:
- Cleanup result and timestamp:

### [ ] 7. Record rollout status accurately

Owners: portal operations, Entra administrator, workspace administrator.

- [ ] Jointly review OAuth, authorization, workspace installation, plugin tool,
  GitHub, Azure, health, audit, monitoring, and cleanup evidence.
- [ ] Record each incomplete or partially verified gate explicitly.
- [ ] Declare production OAuth verified only if Task 12 Step 1 succeeded.
- [ ] Declare workspace installation verified only if Task 12 Step 4 succeeded.
- [ ] Declare managed GitHub creation and Azure publishing verified only if
  Task 12 Step 5 succeeded.
- [ ] Expand beyond the pilot only after a joint go/no-go decision.
- [ ] If rollout is stopped, disable pilot access first, set
  `PORTAL_MCP_ENABLED=false`, restart App Service, verify the MCP surface is
  unavailable, and confirm the normal CU Launch UI still works.
- [ ] Preserve evidence and resources during rollback unless separately
  authorized cleanup is performed.

Final status:

- Production OAuth: verified / partial / not verified
- Workspace plugin installation: verified / partial / not verified
- Managed GitHub creation: verified / partial / not verified
- Azure publishing and `/api/health`: verified / partial / not verified
- Pilot cleanup: completed / approved but pending / not approved
- Rollout decision: expand / hold / roll back
- Decision owners and date:
- Remaining actions:

## Crosswalk to the sequential rollout guide

| Sequential rollout | Task 12 location |
| --- | --- |
| 1. Deploy with MCP disabled | Step 1 |
| 2. Configure Entra delegated API | Step 1 |
| 3. Register exact OpenAI redirect URI | Step 1 |
| 4. Enable MCP and verify bearer challenge | Step 1 |
| 5. Test Cedarville OAuth in developer mode | Step 1 |
| 6. Register MCP app and capture issued ID | Step 1, final bullets |
| 7. Run the plugin finalizer | Step 2 |
| 8. Validate and commit mapping | Step 3 |
| 9. Import/sync workspace marketplace | Step 4 |
| 10. Restricted pilot and disposable smoke test | Step 5 |
| 11. Joint review and access expansion | Step 7 |

Task 12 Step 6 is different from sequential rollout Step 6: Task 12 Step 6 is
the later request for explicit cleanup approval after the disposable smoke test.

## Prompt for a new Codex chat

Copy this prompt into a new chat:

> Continue Task 12 for the CU Launch workspace plugin using
> `docs/portal/task-12-rollout-checklist.md` as the handoff and source of current
> status. Work in `/Users/marchollins/projects/cu-app-portal`. Preserve unrelated
> working-tree changes. Start by checking which checklist items have documented
> evidence, then guide me through only the next incomplete gate. Do not infer
> production readiness from local tests, do not expose credentials, do not
> rerun the security scan, do not publish automatically after launching an app,
> and do not delete pilot resources without separate exact-target approval.

## Source documents

- `docs/superpowers/plans/2026-09-01-codex-portal-workspace-plugin.md`
- `docs/portal/codex-workspace-plugin.md`

