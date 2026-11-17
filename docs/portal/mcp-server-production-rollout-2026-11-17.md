# MCP server production rollout — November 17, 2026

Status: **Authorized; release in progress.** The user accepted the isolated pilot checks as sufficient and explicitly requested production rollout. The unexecuted two-user/guest, prompted MFA/consent, and native refresh scenarios remain documented limitations; they are not being reported as passed.

## Release scope

- Activate **MCP Server (Advanced)** after the recommended and developer templates. Cedarville sign-in is required; PostgreSQL stays optional and defaults to none.
- Deploy the portal, additive `AppMcpConfiguration` migration, publishing/recovery worker image, and updated CU Launch skill/reference on the existing production plugin.
- Retain current main's imported-app adoption and first-publish sign-in review. The original checkout contains unrelated uncommitted work and is untouched; integration happens in the isolated MCP worktree.
- Keep normal per-server Entra enrollment, user admission, and exact callback registration. This rollout does not grant users access to arbitrary new APIs or move servers to Sites.

## Prepared production configuration

Existing portal and publishing identities already have Microsoft Graph `Application.ReadWrite.OwnedBy`; no directory permission expansion was needed. PostgreSQL retains seven days of point-in-time recovery.

The dedicated **CU Launch MCP Plugins** public OAuth client is `5a02b6a3-85a5-4224-ab4b-89e103db41f2`, application object `cf99cad3-b75a-48d2-8aa0-4888dca5502f`, service principal `62a223e2-0a3a-4840-b31c-a01e22a0cf30`. Assignment is required. It was created without secrets, directory/API permissions, user assignments, or callbacks. Pilot clients and pilot access grants are not production defaults. An operator must enroll this client for each new MCP API and register the connection's actual callback before use.

Set `AZURE_PUBLISH_MCP_AUTOMATION_ENABLED=true` and `AZURE_PUBLISH_MCP_CLIENT_IDS` to this client on the production portal and both publishing jobs. No other setting is intentionally changed. Publishing workflows preserve these environment values when updating their immutable images.

## Verification record

- Integrated activation tests: production hostname with preview disabled returns the active advanced template; recommended templates remain first; default storage remains none and public audience remains rejected.
- Integrated local validation: **1,856 tests passed, two skipped**; portal build, publishing-worker build and bundled worker import passed.
- Migration: the actual production application container returned exit status zero after applying `20261116160000_add_app_mcp_configuration`; all migrations reported successfully applied. No credentials were extracted. Deployment-console access was transiently unavailable during read-back and subsequently recovered without network-policy changes.
- Production code, worker digest, plugin release, and live UI/API verification: pending below until deployments finish.

## Recovery

The migration only adds a table/indexes; keep it during an application rollback. Disable the MCP catalog entry to stop new creation and set the MCP automation flag false on portal/jobs to suspend identity provisioning. Preserve existing server identities and data. Re-deploy the recorded previous portal release and previous immutable worker image only if necessary; do not swap the isolated testing slot into production because it has a separate database and disabled transports. Keep the existing CU Launch App binding, identity and sharing during any skill rollback.
