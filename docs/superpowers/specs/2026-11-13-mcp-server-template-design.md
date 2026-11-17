# Advanced MCP Server Template Design

Date: 2026-11-13

Status: Design authorized for implementation November 16, 2026. Local implementation and tests are in this branch; live Entra/host pilot, catalog activation, managed plugin publication, and Azure rollout remain pending.

## Intent and decisions

Let an advanced CU Launch user build and host an MCP server in a managed GitHub repository and Azure App Service, then use that server in a private personal or workspace plugin created with Plugin Creator. OpenAI Sites is not part of this path.

The user requested an advanced template, availability through the CU Launch plugin, and instructions for integration with Plugin Creator. The user explicitly selected **Cedarville users through Entra** for the first version, then authorized optional managed PostgreSQL with no database as the default on November 16, 2026. TypeScript/Next.js, a distinct Advanced Templates group, and per-server Entra resource registrations are recommendations in this design, rather than additional user decisions.

Success is a user-created plugin that authenticates a Cedarville user and successfully calls a harmless tool on its CU Launch-hosted server. Creating a repository, deploying a healthy process, packaging a plugin, and verifying a connected tool are distinct outcomes.

## Existing structure and implications

Inspected the current checkout, rather than relying on the earlier discussion:

- `src/features/templates/catalog.ts` and `types.ts` own templates and the current `recommended`/`developer` grouping. `templates/web-app/template.json` separates static assets from generated overrides.
- `src/features/generation/build-source-snapshot.ts` supplies package files, documentation, manifests, and app-local skills. A new source engine must avoid accidentally receiving the ordinary browser app's generated overrides.
- `src/features/templates/portal-api.ts` currently advertises `{ cedarville: true, public: true }` for every template. `src/features/create-app/validation.ts` does not use legacy `features.entraLogin` to forbid public access. Changing just the template flag would not enforce Cedarville-only access.
- `create_app` already accepts a catalog slug and creates a managed repository without publishing. It uses shared creation, validation, and idempotency services. A separate MCP-specific create tool is unnecessary.
- `src/features/publishing/setup/service.ts` configures browser Auth.js settings and adds redirects to the existing shared Entra application. `azure/graph-client.ts` currently manages those redirects; it does not provision per-server OAuth resources.
- `src/app/api/mcp/route.ts`, `src/features/portal-api/auth.ts`, and the portal protected-resource metadata route are useful patterns. Their portal actor/database lookup and portal administration tools must not be copied into generated servers.
- `verifyPublishedUrl` checks `/api/health`, with a homepage fallback. It does not perform an OAuth login, MCP initialization, or tool discovery.
- The CU Launch plugin is managed from `plugins/cedarville-app-portal/`. Its workspace skill controls portal operations; `src/features/generation/portal-skill.ts` controls work inside generated apps. Both need tailored guidance.
- Plugin Creator's installed `create-plugin/references/server-access.md` and `plugin-packages.md` already support a separately hosted MCP endpoint using portable `mcp.json`. Its Sites default has an explicit existing-server route. Use that route and preserve Azure hosting.

## Approaches

| Approach | Benefit | Cost / decision |
| --- | --- | --- |
| Dedicated Next.js MCP source template | Reuses the current Node App Service workflow and route conventions; close to the portal's MCP implementation | Recommended. New source engine, bearer auth, and identity provisioning are still required. |
| Express MCP source template | Small standalone HTTP server; Express imports already work | Viable later. Requires a new generated Express path without reducing the identity work. |
| Shared multi-user MCP gateway | Fewer Azure processes | Excluded from v1. Changes ownership, deployment independence, isolation, and the existing per-app resource model. |

This proposal proceeds with the first approach for review. It does not record that the user has selected the runtime architecture.

## Template contract

| Field | Proposed value |
| --- | --- |
| Slug / template ID | `mcp-server` / `mcp-server-v1` |
| Display name | `MCP Server (Advanced)` |
| Version | `1.0.0` |
| Category / group | `advanced` / `Advanced Templates` |
| Application kind | `mcp-server` |
| Runtime | Node.js 24 / Next.js; Azure `NODE|24-lts`; `npm start` |
| Hosting | Existing CU Launch shared plan, per-app Azure App Service |
| Authentication | `entra-mcp` with delegated Cedarville sign-in; no anonymous mode |
| Audience | `{ cedarville: true, public: false }` |
| Database | Optional PostgreSQL using existing CU Launch provisioning; default `none` |
| MCP endpoint | Exact `https://<managed-host>/api/mcp` |
| Health | Exact anonymous `GET /api/health` returns 200 |

Chooser copy: “Host tools for your own ChatGPT or Codex plugins on Azure. Requires Codex customization and Cedarville sign-in.” Best for custom plugin backends, internal read-only integrations, and developer-authored tools.

Add explicit optional template metadata `applicationKind`, `authenticationMode`, and `audience`. Legacy templates default to `web-app`, existing browser behavior, and both audience choices. MCP metadata is fixed by the server-side catalog, copied into the request's submitted configuration, and cannot be supplied or overwritten by a model/tool caller. Retain `entraLogin: true` as the existing creation input representing the Cedarville audience; derive bearer authentication from the template, rather than interpreting that boolean as a request for Auth.js scaffolding.

For this template, UI and MCP creation must reject `entraLogin: false`, even with `publicAcknowledgement: true`, before an app record or provider resources are created. The form shows the fixed Cedarville audience and explains that every plugin user signs in. Do not introduce a public template to avoid authentication work.

The template is discoverable in `list_app_templates`, with additive kind/auth metadata and the same audience constraints as the UI. It stays inactive until the pilot gates below pass. Existing app creation behavior remains covered by regression tests.

## Generated server

Use a separate `templates/mcp-server/` source engine, sharing publishing helpers where contracts match. Suggested generated files:

```text
src/app/api/mcp/route.ts
src/app/api/health/route.ts
src/app/.well-known/oauth-protected-resource/route.ts
src/app/.well-known/oauth-protected-resource/api/mcp/route.ts
src/app/page.tsx
src/mcp/server.ts
src/mcp/tools/server-info.ts
src/mcp/auth/config.ts
src/mcp/auth/verify-token.ts
src/mcp/auth/principal.ts
src/mcp/transport.ts
src/mcp/limits.ts
tests/mcp.test.ts
tests/auth.test.ts
docs/mcp-server.md
docs/plugin-creator-handoff.md
.codex/skills/cu-app-portal/SKILL.md
.github/workflows/deploy-azure-app-service.yml
app-portal/deployment-manifest.json
```

The health route has no auth, database, or upstream dependencies. The homepage is a small public description with no tool results, identity details, or configuration values. Discovery metadata is public. All MCP requests require a valid delegated bearer token before dispatch. There are no Auth.js routes, browser-session fallbacks, API-key fallback, or production bypass flags in this engine. Method handling and protocol negotiation follow the pinned SDK/adapter combination verified in the pilot; do not hand-code a parallel JSON-RPC implementation.

Build without production credentials. Load and validate identity configuration inside the relevant request handler, rather than at build/module-import time. With incomplete configuration, MCP/discovery fail closed with a sanitized 503 and health remains 200; never return invented discovery values from placeholders. After configuration is ready, normal missing/invalid caller credentials produce the OAuth 401 challenge.

Use Streamable HTTP, a stateless server/transport lifecycle, and no in-memory per-user sessions. Reuse the portal's `mcp-handler`/official TypeScript SDK integration pattern only after a generated-server pilot confirms compatibility. Pin compatible dependency versions and lockfile together; do not silently float to an incompatible MCP protocol revision. Return JSON responses for the short starter tool; test supported streaming behavior and disconnect cleanup before advertising it. No unbounded background jobs or long-running tool promises.

The starter exposes one harmless authenticated `get_server_info` tool with an empty strict input schema. It returns a display name, template version, and an explicit starter message; it never returns secrets or arbitrary environment values. Mark it read-only, non-destructive, and closed-world; provide an output schema and structured result. It makes no AI API requests and requires no OpenAI API key. There are no sample write tools.

Tool authors add modules under `src/mcp/tools/`. Pass an immutable validated `{ tenantId, objectId }` principal per request, never through module-global mutable identity state or caller-supplied user IDs. Auth authenticates the person; each real tool must separately authorize data and mutations. Do not forward the incoming MCP access token to Microsoft Graph or another backend. Downstream delegated/OBO authorization, database access, and provider secrets are explicit later integrations, not privileges granted by the template.

Transport defaults: allow absent Origin for non-browser MCP clients; reject present origins outside a configured exact allowlist; never reflect arbitrary origins with credentials. Limit request bodies to 256 KiB and tool execution to 20 seconds; enforce limits in the application/adapter, since a route hint alone may not impose a hard timeout. Set no-store, sanitize errors, bound log output, and log request correlation IDs, tool names, duration, and outcomes without headers, tokens, or raw arguments/results. A process-local limit of 60 requests/minute per validated principal is a starter safeguard, explicitly not a distributed quota. Return a bounded 429 with retry guidance; no durable quota service or database is added in v1.

## Entra identity design

Separate three identities: the CU Launch control-plane resource, the existing shared browser-login application, and each generated server's MCP resource. Do not reuse either of the first two audiences for generated tools.

One single-tenant Entra resource application/service principal per server has a stable ownership marker tied to the CU Launch request ID, v2 access tokens, and delegated `mcp.access` scope. Its Application ID URI must satisfy Entra policy and the selected OpenAI host's resource-indicator behavior. Prefer the exact canonical MCP HTTPS URL where permitted. Verify the actual v2 token audience; configure that exact audience (normally the resource application's client ID), not an assumption that it equals the HTTPS resource URL. Server A must reject a valid token minted for server B.

The initial production strategy is the managed Azure hostname, not an unselected custom-domain fallback. Task 0 must demonstrate that this exact resource identifier is accepted by the tenant and intended host. If it is rejected, stop activation and revise this design to choose a verified-domain/resource strategy. Do not silently introduce DNS provisioning, a broker, or a mismatched `api://` resource to get past the gate.

An administrator configures supported OAuth client registration for each intended host. Prefer a predefined client flow for the Entra pilot; verify exact callback URLs, PKCE, discovery, requested resource/scope, token endpoint authentication, and user/admin consent in the actual host. Do not assume Entra implements DCR/CIMD, invent a client ID, synthesize issuer metadata, or place a client secret in a plugin archive. Where a host requires confidential-client credentials, enter them only in its supported secure connection configuration; they never go into a generated app or chat. Client registration/consent is operator setup, distinct from creating the plugin ZIP.

The pilot deliverable must spell out where the predefined client is bound to the installed plugin connection in each host: package field if actually supported, connection UI, or separately registered App flow. Record exact nonsecret fields, responsible actor, whether setup is once per tenant/server/plugin, and any supported connection identifier the package must preserve. An endpoint-only archive is not assumed to finish this binding. If the required binding cannot be made through a supported flow, that host is unsupported for release until the design is revised.

Provisioning is a new control-plane adapter, not code executed by generated servers. Extend setup and repair to reconcile only marked, portal-owned registrations and persist identifiers before later steps. Scope any new Graph permission to portal-owned applications where supported (`Application.ReadWrite.OwnedBy` is a candidate requiring an operator permission review and pilot). Do not grant tenant-wide directory write or consent-grant authority to generated apps. Enterprise client consent and enrollment policy remain administrator-managed. The release runbook must demonstrate the exact selected Graph operations with the approved permission set; a missing permission yields `ACTION_REQUIRED`, not a fallback to the shared browser application or automatic privilege escalation.

If automatic resource creation cannot be approved, operators may bind a pre-created, ownership-verified per-server registration through the same internal service and records. The first production scope then explicitly includes that operator step; do not market it as fully automatic self-service. No generic registration-ID setter is exposed through ordinary environment tools or plugin caller input.

Require signature/JWKS, allowed algorithm, exact issuer/tenant/audience, expiry/not-before, delegated `scp` containing `mcp.access`, and nonempty Entra object ID checks on every authenticated request. Require a Cedarville identity consistent with the existing portal policy in addition to these checks; an email suffix alone is never authorization. Reject app-only tokens, wrong scopes, portal tokens, other servers' tokens, and browser cookies. Configure enterprise app admission to exclude external guests for this Cedarville-only release and verify it in the pilot. Claims identify callers; tool-level checks govern access to actual records.

Public protected-resource metadata declares the exact canonical endpoint, Entra issuer, and fully qualified scope. Missing/invalid tokens receive 401 with `WWW-Authenticate` pointing to this metadata; valid authentication without required permission receives 403. Expose the root metadata route and the path-specific discovery route, backed by the same function and tested for identical resource identity. Bind discovery URLs to configured canonical values, never an arbitrary Host header. Metadata must not claim an OAuth capability the real issuer lacks.

New portal-managed runtime settings: `MCP_RESOURCE_URL`, `MCP_ENTRA_TENANT_ID`, `MCP_ENTRA_ISSUER`, `MCP_ENTRA_AUDIENCE`, `MCP_ENTRA_SCOPE`, and `MCP_ALLOWED_ORIGINS`. Ordinary environment editing must reject these reserved identity/transport settings. JWT verification uses public signing keys and needs no resource-server client secret. Generated production env examples contain placeholders only; deployment supplies values after identity setup. Local tests use generated signing keys and injected verification dependencies, with no production-reachable bypass.

Persist a one-to-one `AppMcpConfiguration` record with request ID, profile version, canonical endpoint, Entra application object/client IDs, service principal ID, scope ID/name, setup status (`NOT_STARTED`, `ACTION_REQUIRED`, `READY`, `FAILED`), safe failure code, and checked timestamp. Never store client secrets in this record. Keep a single-writer/lease boundary during creation/reconciliation and use deterministic scope IDs/ownership records so interrupted setup does not duplicate registrations. A publish retry is not authority to grant new consent.

On repair, retain the server's app ID, audience, scope IDs, and endpoint. Permission or ownership mismatch stops repair. On deletion, include the marked per-server registration/service principal in the existing scoped deletion preview, never shared clients. On rollback, hide the template for new requests without shutting down existing servers or deleting identities. Custom-domain changes for this template are blocked in v1 because changing the resource URL requires a deliberate identity and plugin connection migration; ordinary apps retain current domain behavior.

## Publishing and readiness

Reuse the existing repository, first-publish authorization, worker, GitHub OIDC, and push-to-deploy path. Provision identity as a setup stage, before deployment settings are finalized. Incomplete identity configuration prevents a usable MCP publish; health remains publicly testable without tool access. Repair configures resources and does not deploy.

Use manifest version `1.1.0` for this engine, with additive `applicationKind: "mcp-server"`, `auth.mode: "entra-mcp"`, and `mcp: { endpointPath: "/api/mcp", transport: "streamable-http" }`. Preserve parsing of existing `1.0.0` browser manifests; missing `auth.mode` retains existing behavior. Bearer mode has no browser callback or Auth.js secret settings. Authoritative publishing decisions come from validated portal records; a repository manifest cannot select an arbitrary tenant or registration.

Do not change the meaning of existing `publishStatus: SUCCEEDED`. It establishes deployment verification only. Add a separate MCP deployment probe for this template: exact health HTTP 200 without fallback, canonical discovery metadata, and the unauthenticated MCP 401 challenge, with short deadlines and redirects disabled. This probe uses only the stored Azure hostname, not arbitrary plugin URLs, and executes no tools. Bind recorded checks to a publish attempt/commit and timestamp. V1 deliberately returns this evidence as `currency: "HISTORICAL_ONLY"`, even when its stored result is PASSED: it does not detect every independent push deployment and makes no freshness claim. Do not add a deployment callback service or provider calls to `get_app` just to imply freshness. Client OAuth, initialization, `tools/list`, and `get_server_info` still require an authenticated host test against the currently served endpoint.

Report four separate milestones: repository ready; Azure deployed; OAuth/MCP connection verified in the intended host; plugin created/updated and tool verified. Never label a server Plugin Creator-ready solely because the health route returned 200.

## CU Launch plugin contract

Use existing tools instead of a second provisioning API:

1. `list_app_templates` includes the advanced template when active and returns its kind, authentication mode, and enforced audience.
2. User selects it and approves the existing launch summary; `create_app` creates the repository only, using the unchanged mutation replay contract.
3. Customize through existing actor-specific GitHub access and local Git workflow.
4. User explicitly requests publishing; follow `get_app.allowedNextActions`, `publish_app_to_azure`, and `get_publish_status`. Respect existing separate repair/retry approval boundaries.
5. `get_app` adds nullable `mcp` metadata for accessible MCP apps. No new mutating MCP tools are required.

Proposed additive `get_app.mcp` contract:

```ts
type McpConnectionSummary = {
  profileVersion: "1.0";
  transport: "streamable-http";
  endpointUrl: string | null; // Set after successful publish plus READY identity.
  resourceMetadataUrl: string | null;
  authentication: {
    mode: "entra-mcp";
    tenantId: string;
    issuer: string;
    scopes: string[]; // Fully qualified, nonsecret.
  };
  setupStatus: "NOT_STARTED" | "ACTION_REQUIRED" | "READY" | "FAILED";
  checkedAt: string | null; // Configuration check, not client verification.
  deploymentProbe: {
    status: "NOT_CHECKED" | "PASSED" | "FAILED";
    currency: "HISTORICAL_ONLY";
    attemptId: string | null;
    commitSha: string | null;
    checkedAt: string | null;
  };
  clientVerification: "REQUIRED"; // No claim that portal reads tested a host.
};
```

Return `mcp: null` for other apps. Preserve owner/collaborator/admin access checks and quiet not-found behavior. The response contains no credentials, tokens, backend plugin IDs, or invented tool schemas. Do not add a “verify arbitrary endpoint” portal tool. Expose equivalent connection information in the accessible app-details UI.

## Plugin Creator handoff

The companion [proposed skill instructions](2026-11-13-mcp-server-plugin-skill.md) are the exact text to apply to the source plugin after the capability exists. Do not publish instructions that call a planned tool or treat planned response fields as live.

CU Launch owns source/repository, Azure deployment, runtime identity configuration, health/probe evidence, and repair. Plugin Creator owns the user's plugin identity, skills, portable MCP connection, archive, account save/update, and requested sharing. Plugin installation does not grant server authorization; server authorization does not share a plugin.

Handoff data contains: accessible CU Launch request ID and support reference, managed repo URL/default branch/verified commit if known, verified canonical endpoint/transport/metadata URL, Entra issuer and fully qualified scope, deployment/probe timestamps, authenticated tool-discovery evidence (or explicitly pending), and the user's requested new-plugin or existing-plugin target. No token, secret, `.env`, or Azure/GitHub credential crosses this boundary.

Read the currently installed Plugin Creator skill, then take its **existing MCP server** path. Use a portable `mcp.json` entry with `type: "streamable-http"` and the actual Azure endpoint. Plugin Creator builds `plugin.json` and any workflow skills using its current format; CU Launch must not hard-code a future package schema. Use account creation only for a new plugin and update an eligible existing plugin by its verified ID without changing identity/audience. Never wrap CU Launch's own control-plane endpoint or invent a `.app.json` ID for the user's server.

Use the host's supported OAuth connection UI for login/consent/configuration. Discover tools and schemas with an authenticated MCP client; run only the harmless starter tool as a smoke check. Package creation can remain pending if host auth is blocked; preserve local source/archive and report the exact pending step. Do not substitute Sites, an anonymous endpoint, or a duplicate plugin. Sharing remains a separate explicit user request.

There is no circular requirement to install a plugin before it can be packaged: where the host requires an installed plugin to begin OAuth, prepare/save the endpoint-based package first and label tool discovery and connection verification pending. Use source schemas only for a clearly labeled draft, then reconcile them with live discovery after connection. Do not invent a temporary App binding or claim a pre-install host test happened.

## Version-one boundaries

No public/anonymous mode, alternative IdPs, app-only/machine tokens, Python MCP engine, arbitrary stdio upload, MCP Apps UI/Extensions generation, custom OAuth authorization server, shared gateway, automatic downstream API grants, public directory submission, or automatic plugin sharing. These are possible follow-up projects, not hidden prerequisites.

The workflow does not need Sites for server hosting or plugin packaging. It still depends on available Plugin Creator tools, supported host authentication, tenant/client administrator setup, and the user's repository access.

## Acceptance and rollout gates

1. **Identity/host pilot first:** one isolated CU Launch-style Next.js server on Azure; Entra configuration; real Cedarville sign-in, refresh/reconnect, initialization, tool listing, harmless call, second-user login, guest denial, wrong-server token denial, and restart. Verify independently in Codex and ChatGPT before claiming both are supported. One host passing must not imply the other passed. If discovery/PKCE/resource handling fails, keep the template inactive; resolve with a supported host/Entra configuration rather than writing an OAuth broker implicitly.
2. **Portal contract:** advanced group visible and plugin-discoverable only when active; both creation entry points reject public mode; stored settings and manifests distinguish browser from bearer auth; older templates still work.
3. **Runtime:** generated source builds; strict tool schema, bearer rejection matrix, concurrent distinct identities, Origin policy, body/time limits, and stateless restart behavior pass. No raw auth values in errors/logs/archives.
4. **Control plane:** ownership-scoped, interruption-safe resource setup; action-required consent state; idempotent repair; reserved environment keys; scoped deletion preview; no effect on shared browser identity. Exercise setup using the actual approved permission set.
5. **User workflow:** discover → explicit selection → create → customize → explicit first publish → authenticate → create/update plugin → invoke tool, with no Sites calls or credentials in chat/files. A blocked connection leaves a truthful partial outcome and no duplicate plugin.
6. **Release:** seed catalog, run targeted suites, production build, generated-server test/build, then portal and plugin rollout through their existing separate processes. Preserve current plugin/App identities. Include a user-facing release note in the eventual implementation commit. Disable new creation first for rollback; preserve running resources for investigation.

## Sources and implementation references

- [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth): remote bearer auth/discovery/client integration requirements; actual host interoperability remains a pilot gate.
- [Microsoft Entra MCP guidance](https://learn.microsoft.com/en-us/entra/agent-id/secure-mcp-server-with-entra-id): separate resource registration and resource/audience setup.
- [Official MCP TypeScript SDK server guide](https://ts.sdk.modelcontextprotocol.io/server): supported transport/server lifecycle patterns.
- Installed Plugin Creator source: `/Users/marchollins/.codex/plugins/cache/openai-curated-remote/plugin-creator/0.1.28/skills/create-plugin/references/server-access.md` and `plugin-packages.md`. These establish the existing-server packaging route; reread the installed version when executing.

Implementation plan: [Advanced MCP Server Template](../plans/2026-11-13-mcp-server-template.md).

Builder review completed for this proposal. Its three material questions are addressed above: Task 0 must prove the exact host/client binding recipe and managed-hostname resource policy; deployment probes are explicitly historical, with no unsupported promise of automatic push freshness detection. These are release gates and design constraints, not claims of tested interoperability.

Implementation extension, November 16, 2026: PostgreSQL uses conditional schema/migration/server-only-client assets and a focused source helper for package/env/lock variants. Both no-database and selected-database packages remain locked. Publishing and repair retain existing PostgreSQL/Key Vault behavior; health and OAuth discovery never query the database. The Plugin Creator handoff includes only a verified storage mode, never database credentials.
