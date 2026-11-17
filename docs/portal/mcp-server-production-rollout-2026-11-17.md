# MCP server production rollout — November 17, 2026

Status: **Live in production.** The user accepted the isolated pilot checks as sufficient and explicitly requested production rollout. Production portal, publishing/recovery workers, repository import worker, migration, template metadata, and CU Launch plugin update are deployed and verified. The unexecuted two-user/guest, prompted MFA/consent, and native OAuth token-refresh scenarios remain documented limitations; they are not being reported as passed.

## Release scope

- Activate **MCP Server (Advanced)** after the recommended and developer templates. Cedarville sign-in is required; PostgreSQL stays optional and defaults to none.
- Deploy the portal, additive `AppMcpConfiguration` migration, publishing/recovery worker image, and updated CU Launch skill/reference on the existing production plugin.
- Retain current main's imported-app adoption and first-publish sign-in review. The original checkout contains unrelated uncommitted work and is untouched; integration happens in the isolated MCP worktree.
- Keep normal per-server Entra enrollment, user admission, and exact callback registration. This rollout does not grant users access to arbitrary new APIs or move servers to Sites.

## Prepared production configuration

Existing portal and publishing identities already have Microsoft Graph `Application.ReadWrite.OwnedBy`; no directory permission expansion was needed. PostgreSQL retains seven days of point-in-time recovery.

The dedicated **CU Launch MCP Plugins** public OAuth client is `5a02b6a3-85a5-4224-ab4b-89e103db41f2`, application object `cf99cad3-b75a-48d2-8aa0-4888dca5502f`, service principal `62a223e2-0a3a-4840-b31c-a01e22a0cf30`. Assignment is required. It was created without secrets, directory/API permissions, user assignments, or callbacks. Pilot clients and pilot access grants are not production defaults. An operator must enroll this client for each new MCP API and register the connection's actual callback before use.

`AZURE_PUBLISH_MCP_AUTOMATION_ENABLED=true` and `AZURE_PUBLISH_MCP_CLIENT_IDS` containing this client were set and read back on the production portal and both publishing jobs. Other settings were preserved. Publishing workflows retained these environment values when updating their immutable images.

## Deployed release

[PR #6](https://github.com/cedarville-university/cu-app-portal/pull/6) merged as `6ccfab0755e0b234be9539b6a8c6715740d7cbcb`, preserving main's first-parent history and three user-facing release notes. All production workflows finished successfully at this commit:

| Component | Completed deployment |
| --- | --- |
| Portal | [44151576458, attempt 2](https://github.com/cedarville-university/cu-app-portal/actions/runs/44151576458); active Azure deployment `fee6a1b2-b74c-4493-bad6-074cfb6bf498`, status 4, completed November 17 at 1:52:49 p.m. Eastern |
| Publishing and recovery workers | [44151576456](https://github.com/cedarville-university/cu-app-portal/actions/runs/44151576456); both jobs use `cularimpiqif7jtatmvw6.azurecr.io/publish-worker@sha256:c666730e44592a8b0bbd3ed113386eee38c4cc33fe74389fb6a395b1a07ded0c` |
| Repository import worker | [44151576540](https://github.com/cedarville-university/cu-app-portal/actions/runs/44151576540); `cularimpiqif7jtatmvw6.azurecr.io/repository-import-worker@sha256:665ea68a16ede52feb707be46b5ebf2334db1455473f1aa3c10a45f4815fedf2` |
| Existing CU Launch plugin | [CU Launch](https://chatgpt.com/plugins/plugin_asdk_app_6aa05e6de3dc8191a45e1683ba5ee8e9), version `1.0.6+codex.20261117`, release `pluginrel_6afca2c78d3081918346e2d33fd526a1` |

The feature-branch prestage run stopped at Azure login because the existing federation trusts main only; it made no deployment changes. Main's first portal attempt was intentionally cancelled before deployment while both workers completed. The successful second attempt deployed the portal afterward. No federation changes or testing-slot swap were used.

## Verification record

- Integrated activation tests: production hostname with preview disabled returns the active advanced template; recommended templates remain first; default storage remains none and public audience remains rejected.
- Integrated local validation: **1,856 tests passed, two skipped**; portal build, publishing-worker build, repository-import-worker build and both bundled worker imports passed. Independent release review and targeted release checks passed. Production workflows also passed their worker container checks and scans.
- Migration: the actual production application container returned exit status zero after applying `20261116160000_add_app_mcp_configuration`; all migrations reported successfully applied. No credentials were extracted. Deployment-console access was transiently unavailable during read-back and subsequently recovered without network-policy changes.
- The MCP template was seeded `ACTIVE` (`cmwl1mioz0000prkavd1u3rqp`), without creating a production user app.
- At 1:53 p.m. Eastern, both production hostnames returned HTTP 200 and `{"status":"ok"}` from `/api/health`. Unauthenticated `/api/mcp` returned HTTP 401 with the production protected-resource metadata challenge. Resource metadata returned the correct production control-plane URL, Cedarville tenant issuer and `culaunch.codex.mcp` scope. Anonymous access to `/create/mcp-server` redirected to sign-in.
- A real Cedarville sign-in returned to the live [MCP Server (Advanced) form](https://launch.cedarville.edu/create/mcp-server). It displayed required Cedarville sign-in, optional PostgreSQL and **No database selected by default**. The form was inspected without submitting a production app. Full create/publish/tool/database-persistence verification remains the previously accepted isolated pilot evidence.
- The scheduled recovery execution `cu-launch-publish-recovery-29915695`, started at 1:55 p.m. Eastern, **succeeded using the new immutable publishing-worker image**. This verifies an actual execution in addition to the configured job template.
- Read back the saved production plugin: merged instructions and MCP Plugin Creator reference exactly match source. The existing App binding, retained agent instructions, presentation, workspace listing and sharing audience were preserved. The existing App's **Refresh tools** completed; its displayed catalog includes `review_imported_app_login`, `list_app_templates`, `create_app`, and publishing tools. Subsequent plugin read-back preserved the same release, version and file contents. No Sites service was used.
- Removed only the rollout-created `/home/data/cu-mcp-rollout-20261117` staging directory. An interactive read-back in the actual production app container confirmed it no longer exists. The temporary shell was closed. Pilot resources were retained.

The final evidence update is recorded on `codex/mcp-server-template`; it does not trigger a second production deployment. The production code remains the merged commit above. The original checkout's unrelated changes were left untouched.

## Recovery

The migration only adds a table/indexes; keep it during an application rollback. Disable the MCP catalog entry to stop new creation and set the MCP automation flag false on portal/jobs to suspend identity provisioning. Preserve existing server identities and data. Re-deploy the recorded previous portal release and previous immutable worker image only if necessary; do not swap the isolated testing slot into production because it has a separate database and disabled transports. Keep the existing CU Launch App binding, identity and sharing during any skill rollback.
