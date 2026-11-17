# Isolated MCP pilot cleanup — November 17, 2026

The user requested cleanup of the isolated MCP pilot and test plugins after the [production rollout](mcp-server-production-rollout-2026-11-17.md), without changing production. Historical verification evidence is retained in the [live pilot record](mcp-server-live-pilot-2026-11-17.md).

## Removed and verified

- Azure resource group `rg-cu-mcp-pilot-20261117` no longer exists. Its exact seven-resource inventory was verified before deletion: the B1 plan, dedicated PostgreSQL server, pilot Key Vault, two Web Apps and two user-assigned managed identities. No production resource was in this group. The PostgreSQL server also independently returned `ResourceNotFound`.
- Deleted all four pilot-only Entra applications and their four service principals. Each application and principal was read back as absent. Their application client IDs were `50f001e0-3cb5-4b3f-a172-7860faa4e2a9`, `97b25782-4690-4b10-96d8-0781793582c2`, `a97176d7-e039-4611-a17b-f001686628a4`, and `f30c43d6-9714-4d12-a546-5c16f28f5750`. This removes the pilot enterprise-app assignments and client callback registrations. No shared registration or production client was changed.
- Plugin Management confirmed all three test items uninstalled: `Plugin_d4c630c9c84881918f90bebcdea1fca1`, `plugin_asdk_app_6afc95faeb248191a3c6c4d62125ffbe`, and `plugin_asdk_app_6afc96fe0f0c819197872d864a135fa8`. Their two MCP connection tools were removed from the active tool catalog. The saved pilot package was independently shown as not installed.
- After the user's explicit permanent-deletion confirmation, deleted the saved **CU MCP Pilot ChatGPT** package and both private test App definitions, **CU MCP Pilot None Connection** and **CU MCP Pilot PostgreSQL Connection**, through their exact existing browser records. Each deletion completed and returned to the plugin directory; the App dialogs explicitly included their connections. Independent metadata read-back returned HTTP 404 / `NOT_FOUND` for all three exact plugin IDs above. No permanent-deletion step remains pending.
- Removed the local disposable pilot PostgreSQL credential file. Diagnostic processes, tunnels, the temporary vault operator grant and the public SSH helper had already been removed and verified during the pilot.

## Retained items

- The two private `mhollins/cu-mcp-pilot-*` repositories are **archived and private**, verified by GitHub read-back. Deletion using the existing credential returned HTTP 403. No credential scopes were expanded. Archived repositories preserve source/evidence; they are not deleted.
- Normal Azure/Entra soft-delete retention is preserved; no purge was requested. Testing-slot portal configuration, isolated testing database/history, verification chats, local evidence, and the implementation worktree are retained. The testing slot is shared preview infrastructure rather than a resource in the disposable hosting group.

## Production comparison

A fresh baseline was captured immediately before destructive cleanup at 2:35 p.m. Eastern. At 2:37 p.m., SHA-256 comparisons matched for production portal app settings, site configuration, deployment history, traffic routing, all three worker definitions, the dedicated production OAuth client, and testing-slot app settings. The active production deployment remains `fee6a1b2-b74c-4493-bad6-074cfb6bf498`. Both production `/api/health` endpoints returned HTTP 200 with `{"status":"ok"}`.

Production CU Launch plugin metadata and all six source files matched exactly before and after cleanup: version `1.0.6+codex.20261117`, release `pluginrel_6afca2c78d3081918346e2d33fd526a1`, existing App binding and listing preserved. Plugin discovery still showed CU Launch installed.

The permanent plugin/App deletion phase used a new before/after snapshot of production CU Launch. Its complete metadata, all six source files and sharing audience again matched exactly, including the same release, App binding, workspace listing and owner. No production plugin update, connection action, deployment or configuration change was performed.

Safe inventory, identity deletion results and production hash comparisons are stored under `/private/tmp/cu-mcp-pilot-20261117/cleanup-*.json`. Configuration values and credentials were not included in the evidence. This documentation is recorded only on the feature branch and does not redeploy production.
