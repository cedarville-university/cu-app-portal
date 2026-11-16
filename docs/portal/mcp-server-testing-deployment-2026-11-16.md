# MCP template testing-slot verification

Verified November 16, 2026. This is an isolated **portal preview**, with real Cedarville portal sign-in. The hosted MCP server and Plugin Creator OAuth pilot remains [pending](mcp-server-pilot.md).

## Deployment

| Item | Observed value |
| --- | --- |
| Testing URL | https://cu-app-portal-testing.azurewebsites.net/create/mcp-server |
| Branch | `codex/mcp-server-template` |
| Deployed source | `0cab9d24a51aa7781e9951f63e21c704bb3780c5` |
| Testing deployment | `9a509a64-8da7-4d45-af7d-c808504ba737` |
| Completed, UTC | `2026-11-16T22:21:19.731967Z` |
| Next.js build ID | `Tu41YMgvbfeb6ircgQraf` |
| ZIP SHA-256 | `d3cba6ff05bae6b488ad732314d2977dbdcbdac3538bce8ec1427fb04c72dfde` |
| Database | `cu-app-portal-testing-mcp` |
| Dedicated database role | `cu_launch_testing_mcp` |

The pinned source was built locally in Linux x64 Node.js 24, with a Linux OpenSSL 3 Prisma engine. The portal build and publishing-worker build passed. The package contains the MCP migration, both template database variants, and a testing-specific writable Next.js cache target. Deployment explicitly targeted `--slot testing`; the production workflow was not dispatched and no branch was pushed.

## Isolation

- The new database started empty. No production records were copied. Its dedicated login has no superuser, database-creation, or role-creation privileges. All 25 migrations applied there, including `20261116160000_add_app_mcp_configuration`.
- Testing uses its own session secret and testing-origin authentication and portal URLs.
- `PUBLISH_TRANSPORT=disabled`, `REPOSITORY_IMPORT_TRANSPORT=disabled`, `PORTAL_MCP_ENABLED=false`, and `AZURE_PUBLISH_MCP_AUTOMATION_ENABLED=false`.
- Copied SMTP, GitHub App, directory automation, publishing, and queue settings were cleared. No Azure connection strings are configured for testing. `E2E_AUTH_BYPASS=false` throughout.
- `CU_LAUNCH_MCP_TEMPLATE_PREVIEW=true` requires the exact platform hostname `cu-app-portal-testing.azurewebsites.net`. Production retains the disabled catalog entry.
- No slot swap, production traffic routing, or production deployment occurred. Before/after fingerprints matched for production app settings, site configuration, and deployment history. The latest production deployment remained `864b4e45-2fe0-49bb-b623-cca678613918`. Traffic routing remained empty, and testing has no auto-swap target.
- Production health returned HTTP 200 with `{"status":"ok"}` at both the custom and Azure hostnames before and after deployment.

The slots share App Service compute, and the databases share PostgreSQL compute. Keep testing bounded. Settings have not been prepared for a production swap; **do not swap this preview into production**.

## Portal authentication

The operator explicitly approved appending this callback to the shared portal Entra registration:

`https://cu-app-portal-testing.azurewebsites.net/api/auth/callback/microsoft-entra-id`

The four original callbacks were preserved. Entra's successful `Update application` audit at `2026-11-16T22:24:38.9719308Z` records only `AppAddress` changing from four to five addresses. Derived redirect-URI metadata also changes with the callback list. No permission or consent change was made.

The operator completed Cedarville sign-in in the browser. The observed authenticated page returned to the exact testing `/create/mcp-server` URL, displayed the signed-in account, and showed the MCP form. This verifies portal sign-in; it does not independently verify an MFA challenge or a hosted MCP server's separate bearer-token authentication.

## Verification

- Full repository suite: **1,763 passed, 2 skipped**. The testing-only catalog gate and Cedarville-only access labels have regression coverage.
- Testing `/api/health` and the deployed-source marker returned HTTP 200. The marker matched the source commit above.
- Anonymous access to the create form redirected to login. The testing auth provider advertised the testing callback. The disabled portal MCP endpoint returned HTTP 404.
- A five-minute synthetic session verified the advanced catalog card, correct required-sign-in label, no-database default, PostgreSQL selection and return to no database, Cedarville access selection, absence of a public audience, and zero browser page errors.
- The synthetic fixture was deleted. Follow-up database checks found zero fixture users, zero app requests, and zero MCP server configurations. The temporary database-check helper was removed.
- Real Cedarville sign-in subsequently returned to the template form. Its observed initial state again showed PostgreSQL unselected, no database selected, and only the Cedarville sign-in audience.

No app was submitted or published. This deployment does not update a cloud plugin, create a hosted MCP server, provision a generated app's PostgreSQL database, or establish Codex/ChatGPT host OAuth interoperability. Those checks require a separately scoped disposable hosting pilot with the relevant automation enabled in an isolated target.

To hide the preview, set `CU_LAUNCH_MCP_TEMPLATE_PREVIEW=false` on testing. Keep its isolated database and disabled integrations in place; never restore the original production database URL to testing.
