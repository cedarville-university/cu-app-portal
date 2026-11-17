# Isolated MCP live pilot — November 17, 2026

Status: **Both isolated servers published successfully; delegated MCP and PostgreSQL checks passed. Native Plugin Creator/host verification remains incomplete.** Production availability remains disabled.

## Isolated resources

- Resource group: `rg-cu-mcp-pilot-20261117`.
- Dedicated Linux App Service plan: `asp-cu-mcp-pilot-20261117`, B1.
- Dedicated PostgreSQL 16 server: `psql-cu-mcp-pilot-261117-c77e`, Standard_D2ds_v5. Azure rejected the smaller Burstable SKU in this region.
- PostgreSQL app vault: `kv-cu-mcp-pilot-cmwkvfg7`.
- The portal records remain in the previously isolated testing database, accessed only as `cu_launch_testing_mcp`. No production records or queue were used.

| Variant | Testing request | Private pilot repository |
| --- | --- | --- |
| No database | `cmwkv7rrw0002naj4i4vbuewt` | [No-database pilot](https://github.com/mhollins/cu-mcp-pilot-none-261117-cmwkv7rrw0002naj4i4vbuewt) |
| PostgreSQL | `cmwkvfg79000anaj4zjk4nfmm` | [PostgreSQL pilot](https://github.com/mhollins/cu-mcp-pilot-postgresql-261117-cmwkvfg79000anaj4zjk4nfmm) |

Both requests were submitted through the testing UI under the signed-in owner. Generation succeeded with the intended database choice and Cedarville-only audience.

## Verified server behavior

- Both actual generated repositories pass **13 tests each**, type checking, and a production build.
- The PostgreSQL pilot repository adds a read-only `get_pilot_storage_check` tool and a synthetic fixture migration. The lookup key includes the authenticated tenant and object IDs. This customization does not change the production template.
- CU Launch's real publish service, runtime, ARM client, and identity store ran for both requests, using an operator-driven private queue adapter and test targets. The PostgreSQL app's database was created through the existing provisioning path.
- Both Web Apps and their owned Entra API applications/service principals were created. Entra accepted each exact HTTPS Azure `/api/mcp` Application ID URI with v2 access tokens configured.
- Initial publishing correctly suspended with `MCP_CLIENT_ENROLLMENT_REQUIRED`, preserving resource IDs and cleanup targets. After the explicit pilot-only enrollment approval, both real deployment workflows and the canonical publisher completed successfully. Both testing records have `publishStatus: SUCCEEDED` and `probeStatus: PASSED`.
- Public health returned 200, resource discovery matched the exact endpoint/tenant/scope, and unauthenticated MCP POST returned 401 with the resource-metadata challenge. The no-database Web App has no `DATABASE_URL`; the PostgreSQL Web App uses a Key Vault reference. Neither has browser-auth credentials.
- A real MCP SDK client completed authorization-code/PKCE S256 through Cedarville Entra, initialized both servers, listed tools, called `get_server_info`, refreshed each token, and called again. A token issued for the no-database server was rejected by the PostgreSQL server with 401. This is diagnostic-client evidence, not native Codex or ChatGPT evidence.
- The PostgreSQL server's read-only tool retrieved the synthetic `cu-mcp-pilot-20261117-persisted` fixture using the authenticated tenant/object ID. Azure recorded the isolated app restart as successful at 17:26:53 UTC. The existing diagnostic session's first post-restart call timed out; a fresh Entra/PKCE connection then initialized, read the same persisted row, refreshed its token, and called successfully at 17:30:31 UTC. Access and refresh tokens stayed in process memory; no token was put in a plugin, file, or evidence report. Both diagnostic processes exited, discarding their in-memory credentials.
- At 17:27 UTC, production app-setting, site-configuration, deployment-history, and traffic fingerprints still matched the fresh pre-pilot baseline. Both production health URLs returned HTTP 200 with `{"status":"ok"}`. The latest production deployment remained `864b4e45-2fe0-49bb-b623-cca678613918`.

| Variant | Successful publish attempt | Terminal successful GitHub run |
| --- | --- | --- |
| No database | `cmwkylj140001wd6aabdd99dn` | [44136103679](https://github.com/mhollins/cu-mcp-pilot-none-261117-cmwkv7rrw0002naj4i4vbuewt/actions/runs/44136103679), commit `ab37cbf1e323897473432a0b345ec73fd7c41b19` |
| PostgreSQL | `cmwkyo64v0001wdeo2gqaqg8x` | [44136506924](https://github.com/mhollins/cu-mcp-pilot-postgresql-261117-cmwkvfg79000anaj4zjk4nfmm/actions/runs/44136506924), commit `39530348e5090b6acd4fca36cfe751af0639d887` |

The first deployments exposed a real publisher startup race: a single health request timed out after 10 seconds while the newly deployed server started. The publisher now makes up to six attempts for network failures (including metadata body reads), 404, or 5xx, waiting five seconds between attempts. Identity drift, redirects, and anonymous access still fail immediately. Interrupted-deployment recovery renews its publishing claim every 20 seconds while checking GitHub and startup, preserving fenced final writes. Review reproduced both the metadata-body timeout and a 150-second workflow/health sequence exceeding the old recovery lease; both regression tests failed before the fixes and passed afterward. Regression checks passed: **1,769 tests, two skipped**, portal build, worker build, and bundled worker entry import. The pilot publisher ran this worktree's code directly; the body-read and recovery-heartbeat follow-ups were verified locally after those successful publishes. Testing's shared publishing worker and all production deployments were left unchanged. Email notification attempts were safely rejected because SMTP configuration was deliberately absent.

## Repository authentication boundary

The normal testing-slot repository bootstrap failed because its copied GitHub key is an unresolved production Key Vault reference. Automatic approval review rejected extracting and copying that production private key into testing. The operator's existing GitHub session also cannot create repositories in `cu-app-portal-repos`.

The pilot instead uses two new **private personal repositories** under `mhollins`, CU Launch's generated snapshots and GitHub client code, and a local operator authentication adapter confined to those repositories. Existing GitHub credentials stay in the local process; none were copied to Azure or plugin files. Normal managed-organization GitHub App authentication is therefore **not verified by this pilot**. Copied GitHub App settings were cleared again in testing; its publishing/import queues, email, and portal MCP API remain disabled.

## Entra identities and approved enrollment

| Identity | Application client ID |
| --- | --- |
| No-database API | `50f001e0-3cb5-4b3f-a172-7860faa4e2a9` |
| PostgreSQL API | `97b25782-4690-4b10-96d8-0781793582c2` |
| CU MCP Pilot Codex 20261117 | `a97176d7-e039-4611-a17b-f001686628a4` |
| CU MCP Pilot ChatGPT 20261117 | `f30c43d6-9714-4d12-a546-5c16f28f5750` |

The user explicitly approved and the operator applied preauthorization of only these two clients for the new APIs' `mcp.access` scopes, plus assignment of only Marc Hollins (`5cd2ddc7-1ef9-4f45-8fed-41d0cbb5b1ea`) to the four new enterprise applications. Assignment remains required. No shared registration, directory API permission, or tenant-wide consent grant changed. Automatic approval review rejected the enrollment before that exact approval; it was applied only after approval.

The diagnostic flow used the new Codex pilot public client with `tokenEndpointAuthMethod: none`, `http://localhost:51857/callback`, the exact server's `<endpoint>/mcp.access` scope, `openid profile email offline_access`, and the endpoint as the resource indicator. Discovery used `https://login.microsoftonline.com/<tenant>/v2.0`; Entra accepted PKCE and the resource indicator. Native host callbacks must be obtained from their actual connection flows before registration. This localhost diagnostic recipe does not establish native host support.

The operator separately approved temporary **Key Vault Secrets Officer** on the single pilot vault above. Assignment `d188c147-6e72-47f7-970c-63a04e7658c1` was removed after publishing and its absence read back. Workload access remains intact. The broader resource-group grant was rejected and was not applied.

## Plugin Creator connection status

Two complete private-test packages were built and inspected using Plugin Creator's existing-server instructions and the documented portable manifests. Each contains the two verified Azure endpoints, one of the new public OAuth client IDs, explicit scopes, and a read-only verification skill. No Sites server, client secret, or bearer token is included.

Plugin Creator returned `502: Plugin archive is unavailable` for both a readable temporary path and a readable worktree path. No plugin ID or successful save was returned. The packages remain in the ignored pilot workspace for retry; creation, update, sharing preservation, installation, native OAuth, and post-install calls are **unverified**. Native Codex UI automation was unavailable; the ChatGPT browser fallback requires the operator's sign-in. Do not create placeholder plugins or claim native host success from the diagnostic client results.

## Remaining live checks

Complete private Plugin Creator save/update, host installation/OAuth, and actual post-install tool calls when the upload/host prerequisites are available. Codex and ChatGPT must be verified independently. Real two-user, guest-admission, and prompted MFA/consent tests require additional operator participation; configured assignment requirements and automated JWT tests are not substitutes.

No test plugin has been created yet. Keep the production template disabled until the remaining pilot gates and representative publishing-identity permissions are proven. Retain the dedicated test resources and private repositories for host verification; they are isolated but continue to incur Azure charges. Remove them through a deliberate cleanup after that verification. Local diagnostic clients, SSH forwarding, and the Azure tunnel were stopped; their three loopback ports no longer listen. The temporary public SSH host-key helper was removed from testing and an authenticated read returned 404. No production credential was copied into testing or plugin files.
