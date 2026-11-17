# Isolated MCP live pilot — November 17, 2026

Status: **In progress; OAuth enrollment awaits explicit operator approval.** No completed hosted MCP connection or Plugin Creator integration is claimed. Production availability remains disabled.

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

## Verified so far

- Both actual generated repositories pass **13 tests each**, type checking, and a production build.
- The PostgreSQL pilot repository adds a read-only `get_pilot_storage_check` tool and a synthetic fixture migration. The lookup key includes the authenticated tenant and object IDs. This customization does not change the production template.
- CU Launch's real publish service, runtime, ARM client, and identity store ran for both requests, using an operator-driven private queue adapter and test targets. The PostgreSQL app's database was created through the existing provisioning path.
- Both Web Apps and their owned Entra API applications/service principals were created. Entra accepted each exact HTTPS Azure `/api/mcp` Application ID URI with v2 access tokens configured.
- Initial publishing correctly suspended with `MCP_CLIENT_ENROLLMENT_REQUIRED`, preserving resource IDs and cleanup targets. No application code or GitHub deployment workflow has been dispatched yet.
- Two single-tenant public OAuth clients were prepared without client secrets. Their requested permissions reference only these two new custom MCP scopes. User assignment is required; access has not yet been enrolled.
- Production app-setting, site-configuration, deployment-history, and traffic fingerprints still match the fresh pre-pilot baseline. Both production health URLs returned HTTP 200 with `{"status":"ok"}` after these checks. The latest production deployment remains `864b4e45-2fe0-49bb-b623-cca678613918`.

## Repository authentication boundary

The normal testing-slot repository bootstrap failed because its copied GitHub key is an unresolved production Key Vault reference. Automatic approval review rejected extracting and copying that production private key into testing. The operator's existing GitHub session also cannot create repositories in `cu-app-portal-repos`.

The pilot instead uses two new **private personal repositories** under `mhollins`, CU Launch's generated snapshots and GitHub client code, and a local operator authentication adapter confined to those repositories. Existing GitHub credentials stay in the local process; none were copied to Azure or plugin files. Normal managed-organization GitHub App authentication is therefore **not verified by this pilot**. Copied GitHub App settings were cleared again in testing; its publishing/import queues, email, and portal MCP API remain disabled.

## Entra identities and pending enrollment

| Identity | Application client ID |
| --- | --- |
| No-database API | `50f001e0-3cb5-4b3f-a172-7860faa4e2a9` |
| PostgreSQL API | `97b25782-4690-4b10-96d8-0781793582c2` |
| CU MCP Pilot Codex 20261117 | `a97176d7-e039-4611-a17b-f001686628a4` |
| CU MCP Pilot ChatGPT 20261117 | `f30c43d6-9714-4d12-a546-5c16f28f5750` |

Pending authorization is to preauthorize only these two clients for the new APIs' `mcp.access` scopes and assign only the signed-in tester, Marc Hollins (`5cd2ddc7-1ef9-4f45-8fed-41d0cbb5b1ea`), to the four new enterprise applications. Assignment remains required. No shared registration, directory API permission, or tenant-wide consent grant is proposed. Automatic approval review requires explicit authorization for these specific access changes; the pilot must not bypass that boundary.

The operator separately approved **Key Vault Secrets Officer** on the single empty pilot vault above. The temporary assignment ID is `d188c147-6e72-47f7-970c-63a04e7658c1`; it must be removed after testing. The broader resource-group grant was rejected and was not applied.

## Remaining live checks

After approved enrollment, retry each existing request and monitor its actual GitHub deployment to completion. Then verify health, discovery, unauthorized challenges, real delegated-token MCP initialization/list/call, PostgreSQL migration and persistence across restart, refresh/reconnect, and wrong-server token denial. Separately complete private Plugin Creator save/update, host installation/OAuth, and actual post-install tool calls. Codex and ChatGPT must be verified independently. Real two-user and guest-admission testing may require additional operator participation.

No test plugin has been created yet. Keep the production template disabled until the remaining pilot gates and representative publishing-identity permissions are proven. Record final production comparisons, resource retention/cleanup, and removal of temporary operator vault access when the pilot ends.
