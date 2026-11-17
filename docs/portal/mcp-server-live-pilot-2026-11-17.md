# Isolated MCP live pilot — November 17, 2026

Status: **Both isolated servers published successfully; Plugin Creator save/update, native ChatGPT Work and local Codex tool calls, and PostgreSQL persistence passed.** The user accepted the completed checks as sufficient and subsequently authorized [production rollout](mcp-server-production-rollout-2026-11-17.md). Unexecuted checks remain documented limitations.

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
- The final post-native comparison, started at 18:15 UTC, confirmed production app-setting, site-configuration, deployment-history, and traffic fingerprints still matched the fresh pre-pilot baseline. Both production health URLs returned HTTP 200 with `{"status":"ok"}`. The latest production deployment remained `864b4e45-2fe0-49bb-b623-cca678613918`; the removed temporary vault grant was still absent.

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

The diagnostic flow used the new Codex pilot public client with `tokenEndpointAuthMethod: none`, `http://localhost:51857/callback`, the exact server's `<endpoint>/mcp.access` scope, `openid profile email offline_access`, and the endpoint as the resource indicator. Discovery used `https://login.microsoftonline.com/<tenant>/v2.0`; Entra accepted PKCE and the resource indicator. These diagnostic results are separate from the later native host verification below.

The operator separately approved temporary **Key Vault Secrets Officer** on the single pilot vault above. Assignment `d188c147-6e72-47f7-970c-63a04e7658c1` was removed after publishing and its absence read back. Workload access remains intact. The broader resource-group grant was rejected and was not applied.

## Plugin Creator connection status

Two complete private-test packages were built and inspected using Plugin Creator's existing-server instructions and the documented portable manifests. Each contains the two verified Azure endpoints, one of the new public OAuth client IDs, explicit scopes, and a read-only verification skill. No Sites server, client secret, or bearer token is included.

Initial `create_plugin` calls returned `502: Plugin archive is unavailable`; no creation was repeated while uncertain. After the user's ChatGPT browser sign-in, the supported archive uploader saved [CU MCP Pilot ChatGPT](https://chatgpt.com/plugins/Plugin_d4c630c9c84881918f90bebcdea1fca1), version 0.1.0, under exact ID `Plugin_d4c630c9c84881918f90bebcdea1fca1`. Source inspection confirmed both MCP definitions and the verification skill. The package initially offered only **Open in desktop app**, demonstrating that portable MCP packaging alone did not register a cloud connection.

Both existing Azure endpoints were then registered through ChatGPT's custom MCP flow. The actual callbacks were appended only to the new ChatGPT pilot client, preserving all other client settings. Both connections show the intended Cedarville account and **Authorization used OAuth**. They remain user-owned development connections; **Publish to workspace** was not used.

| Connection | Actual App ID from settings | Actual generated callback |
| --- | --- | --- |
| No database | `asdk_app_6afc95faeb248191a3c6c4d62125ffbe` | `https://chatgpt.com/connector/oauth/6dvcjkGL8l4j` |
| PostgreSQL | `asdk_app_6afc96fe0f0c819197872d864a135fa8` | `https://chatgpt.com/connector/oauth/Ko4Cy5HmK0Nm` |

The native flow uses the ChatGPT pilot OAuth client `f30c43d6-9714-4d12-a546-5c16f28f5750` with token endpoint auth `none`, no secret, the matching server/resource endpoints, its full custom scope selected as the default, and `openid profile email offline_access` base scopes. OIDC discovery stayed enabled. S256 was enabled after the real diagnostic proved support, because Entra v2 metadata left the host's S256 option unchecked. Callbacks were registered as public-client redirects. The same registered App connections are usable from ChatGPT Work and Codex; a separate Codex OAuth client was not needed for that App-binding route.

`update_plugin` successfully updated the **same** plugin to 0.1.1, release `pluginrel_6afc97c8caa88191990d970c4efc84ad`. Root `.app.json` binds these verified App IDs; both raw MCP maps are empty to avoid duplicate server connections. Read-back confirmed the complete default prompt and skill were preserved, and sharing remained **PRIVATE, owner only**. The browser then offered **Install plugin**, and installation succeeded with both apps showing **Connected**. No Sites call or second Azure server was needed for registration.

With the user's explicit approval for each new chat, the installed plugin was tested separately:

| Host | Verification chat | Actual completed MCP calls |
| --- | --- | --- |
| ChatGPT Work | `6afc9847-b6d8-83ea-a2f4-b5ba2b240669`, **Pilot verification report**; backing execution `6afc9853-8f38-8191-abdc-bb767093400f` | Both `get_server_info` calls and PostgreSQL `get_pilot_storage_check({})` |
| Local Codex | `01a1eab4-b151-7f10-9325-a9ee27338090`, **Verify CU Launch MCP in Codex** | Both `get_server_info` calls and PostgreSQL `get_pilot_storage_check({})` |

Both execution records contain the three completed `codex_apps` MCP calls. Both hosts reported `isError: false`, the correct server names, and the actual storage result `{"storage":"postgresql","rowPresent":true,"value":"cu-mcp-pilot-20261117-persisted"}`. No authentication/discovery error or mutation occurred. Tool results report server version 1.0.0; package version 0.1.1 was verified separately through Plugin Creator source and metadata. Host-side wire initialization and native refresh behavior were not separately captured; the real SDK refresh/reconnect evidence above remains distinct.

## Remaining live checks

Real two-user, guest-admission, prompted MFA/consent, and host-managed refresh/reconnect tests remain. They require additional operator participation or a longer-lived native session; configured assignment requirements and automated JWT tests are not substitutes. Normal managed-organization GitHub App bootstrap and representative publishing-identity directory permissions remain unverified by the local operator adapter.

The user explicitly approved production rollout after reviewing this evidence; do not treat the unexecuted checks as failures or as unrevoked activation blockers. Retain the private plugin, development connections, dedicated test resources, and private repositories for these checks; Azure resources continue to incur charges. Remove them through deliberate scoped cleanup afterward. Local diagnostic clients, SSH forwarding, and the Azure tunnel were stopped; their three loopback ports no longer listen. The temporary public SSH host-key helper was removed from testing and an authenticated read returned 404. No production credential was copied into testing or plugin files. CU Launch's source plugin guidance now includes this tested cloud-registration handoff; this pilot does not publish that update to the production CU Launch plugin.
