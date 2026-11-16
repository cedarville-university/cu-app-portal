# Advanced MCP Server Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only if the user selects delegated execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create a Cedarville-authenticated MCP server through CU Launch and connect their own Plugin Creator plugin to its Azure endpoint without Sites.

**Architecture:** A dedicated Next.js MCP source template reuses CU Launch's managed repository and App Service deployment. Per-app Entra resource configuration is provisioned by the portal and exposed as nonsecret connection metadata. The workspace plugin hands the existing server to Plugin Creator's existing-MCP-server packaging flow.

**Tech Stack:** TypeScript, Node.js 24, Next.js, official MCP SDK plus a pilot-verified HTTP adapter, jose, Prisma/PostgreSQL for portal records, Microsoft Graph, Azure App Service, existing GitHub Actions and portal workers.

**Spec:** [Advanced MCP Server Template Design](../specs/2026-11-13-mcp-server-template-design.md). [Proposed plugin skill text](../specs/2026-11-13-mcp-server-plugin-skill.md) travels with this plan.

**Status:** Local implementation authorized November 16, 2026 and implemented on `codex/mcp-server-template`; live pilot/activation and plugin publication remain pending. The original plan follows for traceability. The user requested design and planning. Review the proposed architecture before implementation. The host/identity pilot is the first implementation gate and needs its own explicitly scoped authorization before creating cloud resources, registering clients, or saving a test plugin. Nothing in this document grants those actions now.

## Global Constraints

- Slug `mcp-server`, ID `mcp-server-v1`, name `MCP Server (Advanced)`, version `1.0.0`, category `advanced`, group `Advanced Templates`.
- Runtime Node.js 24 / Next.js, Azure `NODE|24-lts`, startup `npm start`, Streamable HTTP at `/api/mcp`.
- Audience `{ cedarville: true, public: false }`; `entraLogin: true`; database `none` only for v1.
- Exact anonymous `GET /api/health` returns 200; public OAuth discovery; delegated bearer auth before every MCP dispatch; no browser-cookie or app-only fallback.
- One per-server Entra resource identity; delegated `mcp.access`; no shared portal/browser audience and no credentials in plugin archives, tools, or chat.
- Body limit 256 KiB; execution deadline 20 seconds; process-local starter limit 60 requests/minute per validated principal, not a distributed quota.
- Manifest version `1.1.0` for this engine; existing `1.0.0` manifests retain browser behavior.
- No Sites calls, duplicate plugin, automatic plugin sharing, custom OAuth broker, public mode, or downstream API permissions implied by this feature.
- Initial template inactive until the authorized host/identity pilot and release checks pass.
- Preserve existing unrelated changes, including the currently untracked `.impeccable/` directory. Do not edit installed plugin caches.

## Review Focus

1. Old portal/plugin versions: missing additive fields or absent template must produce an unavailable/pending explanation, never guessed endpoints or Sites fallback (Tasks 1, 5, 6).
2. Multi-user and multi-server traffic: caller context must not cross requests and a valid token for server A must fail on B (Tasks 0, 2).
3. Interrupted identity creation or changed Entra consent: resume the same owned registration without duplicates or broader consent (Tasks 3, 4).
4. Ordinary settings, custom domains, repair, and deletion: cannot replace MCP identity or mutate a shared registration (Tasks 3, 4, 5).
5. Healthy deployment or saved plugin with failed OAuth/tool discovery: show partial readiness and preserve the existing server/plugin identity (Tasks 0, 4, 6, 7).

## File and interface map

Existing file paths below were checked in the current checkout. Paths marked Create are proposed. Keep the feature in focused modules; do not refactor unrelated browser/import paths.

| Owner | Create | Modify |
| --- | --- | --- |
| Catalog and policy | `src/features/templates/policy.ts`, matching test | `types.ts`, `catalog.ts`, `portal-api.ts`, creation validation/form/actions, shared creation service, seed tests |
| Generated engine | `templates/mcp-server/template.json`, its `files/` tree; `src/features/generation/mcp-server-source.ts`, matching test | source snapshot dispatch, manifest, publishing files, token map only if needed |
| Entra resources | `src/features/mcp-servers/types.ts`, `identity-service.ts`, `identity-store.ts`, `src/features/publishing/azure/mcp-identity-client.ts`, tests | Prisma schema/migration; setup/config/environment/deletion contracts |
| Setup and verification | `src/features/mcp-servers/deployment-probe.ts`, test | publishing setup/runtime/runner, environment reserved keys, deployment workflow output as required |
| Connection data | `src/features/mcp-servers/connection-summary.ts`, test; app-details connection component/test | app summary/query; existing `get_app` output; onboarding/details pages |
| Agent workflow | workspace skill `references/mcp-server-plugin-creator.md`; generated app MCP reference; behavior scenarios | workspace skill/metadata, generated app skill builder, plugin contract tests/docs/release metadata |

## Task 0: Prove host authentication and runtime feasibility

**Files:**
- Create: `docs/portal/mcp-server-pilot.md` with a nonsecret reproducible configuration and evidence table.
- Create: a throwaway fixture outside production templates during the authorized pilot; retain only reusable source/tests after review.

**Interfaces:**
- Consumes: design's exact endpoint, per-server resource, scope, and audience requirements.
- Produces: pinned SDK/adapter/protocol versions; tested host list; exact issuer/discovery behavior; actual resource/audience mapping; selected OAuth client registration and plugin-connection binding procedure; approved Graph operation/permission list. Subsequent tasks consume these decisions.

- [ ] Prepare a pilot checklist covering Codex and ChatGPT separately, actual callback/configuration UI, PKCE/S256 discovery, scope/resource request, consent, v2 token audience, guest admission, refresh/reconnect, two users, process restart, and cross-server rejection. Record expected outcomes before running it. Prove the managed Azure hostname is accepted as the resource identifier; rejection stops activation pending a revised domain/resource design.
- [ ] Obtain an explicitly scoped request for pilot cloud/identity/plugin actions when executing this plan. Reuse approved disposable resources if available; do not change shared clients or consent without operator authorization.
- [ ] Run one isolated Next.js server using the proposed deployment contract and selected pinned dependencies. Use a real supported Entra/OpenAI connection, never manually paste a token to simulate host success. Use a second test resource identity for cross-audience rejection.
- [ ] Connect, initialize, list tools, and call only `get_server_info` in each intended host. Record timestamps, safe request IDs, host, commit/dependency versions, and pass/fail; do not record tokens, secrets, or full personal claims. Verify token validation and concurrent user isolation in fixture tests. Record the exact supported place the predefined client is bound to the plugin connection, who configures it, whether it repeats per server/plugin, and any verified nonsecret App/connection identifiers required by the package. If installation must precede login, save the pilot package first and label auth pending until tested.
- [ ] Stop template activation if a host cannot discover/complete auth. Document whether the blocker is client registration, issuer metadata, resource URI policy, tenant consent, or permissions. Resolve through supported configuration; a broker or alternative identity provider requires a revised design.
- [ ] Commit the sanitized pilot report and reusable fixture tests only after reviewing the diff. This commit is evidence, not a production feature release.

**Acceptance:** At least the intended initial host completes the full flow; claims are limited to tested hosts. Fully self-service identity provisioning is advertised only if the approved permission set actually supports it; otherwise the operator-prepared registration path is documented and implemented. No later task guesses these pilot outputs.

## Task 1: Add catalog metadata and enforce the fixed audience

**Files:**
- Modify: `src/features/templates/{types,catalog,portal-api}.ts` and their tests; `prisma/seed.test.ts`.
- Create: `src/features/templates/policy.ts`, `policy.test.ts`.
- Modify: `src/features/create-app/validation.ts`, `template-form.tsx`, `template-form-fields.tsx`, `audience-field.tsx`, associated tests; `src/app/create/actions.ts`, `src/features/portal-mcp/tools/create-app.ts`, `src/features/app-requests/create-generated-app.ts` and tests.

**Interfaces:**
- Add `TemplateAudience = { cedarville: boolean; public: boolean }` and optional kind/auth/audience metadata to `PortalTemplate`.
- Produce `getTemplatePolicy(template: PortalTemplate): { applicationKind: "web-app" | "mcp-server"; authenticationMode: "browser" | "entra-mcp"; audience: TemplateAudience }` in `policy.ts`; browser mode means existing audience behavior, not mandatory login.
- Extend `CreateAppSchemaOptions` with `audience: TemplateAudience`; all callers pass the resolved catalog policy. Shared creation validates it again before mutations.

- [ ] Write failing tests: advanced grouping/serialization; inactive template exclusion; active MCP template summary with no public choice; direct UI and MCP requests with `entraLogin: false` rejected even with public acknowledgement; no DB/provider calls on rejection. Existing templates still offer both audience choices.
- [ ] Run `npm test -- src/features/templates src/features/create-app/validation.test.ts src/app/create/actions.test.ts src/features/portal-mcp/server.test.ts`; confirm the intended new assertions fail.
- [ ] Implement policy normalization and audience validation across UI, MCP adapter, and shared creation. Keep MCP `create_app` input shape and replay semantics; do not allow caller-controlled identity metadata. Persist derived kind/auth profile in submitted configuration for new MCP requests.
- [ ] Add the catalog entry disabled during development. Render fixed Cedarville audience copy with an explicit selected/acknowledged state; there is no public radio for this template. Seed category/policy metadata. Activation occurs in Task 7.
- [ ] Run the targeted tests above plus form/shared-creation/seed tests; require PASS. Review older request fallback behavior.
- [ ] Commit only these policy/catalog changes. Keep runtime availability disabled until later tasks are complete.

## Task 2: Generate a buildable authenticated MCP server

**Files:**
- Create: `templates/mcp-server/template.json`, generated tree listed in the design, `src/features/generation/mcp-server-source.ts`, `mcp-server-source.test.ts`.
- Modify: `src/features/generation/{build-source-snapshot,deployment-manifest,publishing-files,portal-skill}.ts` and related tests.

**Interfaces:**
- Produce `buildMcpServerGeneratedFiles(input: CreateAppRequestInput): Record<string, string>` in `mcp-server-source.ts`.
- Emit the manifest's `applicationKind`, bearer `auth.mode`, and `mcp` descriptor from the design; ordinary manifests keep existing semantics.
- Generated `verifyMcpBearerToken(authorization: string | null, config: McpAuthConfig, dependencies?: VerificationDependencies): Promise<McpPrincipal>` returns immutable `{ tenantId: string; objectId: string }` or a typed safe auth error. The generated config/dependency/error types live alongside verification, independently of the portal's database/actor types.
- Generated `createMcpHandler(principal: McpPrincipal): (request: Request) => Promise<Response>` uses the pilot-selected SDK/adapter and per-request identity, not global mutable state.

- [ ] Write failing generation/manifest tests for exactly one MCP engine, safe escaping of user strings, placeholder-only env examples, absence of browser secret/callback scaffolding, correct source assets, Node startup, and backward-compatible manifests.
- [ ] Write generated-runtime tests for missing/expired/not-yet-valid/wrong-issuer/wrong-tenant/wrong-audience/wrong-scope/app-only tokens; a valid request; cross-server rejection; two concurrent principals; root/path discovery identity; canonical Host handling; empty strict input schema; 401 versus 403; disallowed Origin; missing Origin; oversized body; deadline cleanup; and bounded 429. Inject test JWKS/keys only through tests. With missing identity settings, require sanitized 503 on MCP/discovery and health 200; build without production credentials.
- [ ] Run `npm test -- src/features/generation/mcp-server-source.test.ts src/features/generation/deployment-manifest.test.ts src/features/generation/build-source-snapshot.test.ts` to confirm intended failures before implementing.
- [ ] Build the focused source engine and static files. Reuse shared publishing output; override browser-oriented generation for this engine. Use pilot-verified pinned dependencies/lockfile, sanitized errors, no-store, deterministic manifests, public health/discovery, and authenticated `get_server_info`. No OpenAI API integration/key requirement.
- [ ] Render a real snapshot into a temporary directory. Use `npm ci`, `npm test`, and `npm run build` in that directory; require all three to succeed. Verify packaged workflow includes files needed at runtime. Tests against generated strings alone are insufficient.
- [ ] Run `npm test -- src/features/generation/build-archive.test.ts src/features/generation/publishing-files.test.ts src/features/generation/portal-skill.test.ts` plus new tests; require PASS. Commit the inactive template engine with no live resources.

## Task 3: Persist and reconcile per-server Entra identities

**Files:**
- Modify: `prisma/schema.prisma`; Create: a new additive migration named `add_app_mcp_configuration` using the implementation date.
- Create: `src/features/mcp-servers/{types,identity-store,identity-service}.ts` and tests.
- Create: `src/features/publishing/azure/mcp-identity-client.ts`, matching test; modify provider/config dependency contracts as needed.
- Modify: `src/features/app-deletion/{actions,external}.ts` and tests for owned identity preview/removal.

**Interfaces:**
- `McpIdentityRecord` represents the design's persisted `AppMcpConfiguration`; application/client/service-principal/scope IDs are nullable until recorded; request ID is unique. No client secrets.
- `ensureMcpIdentity(input: { appId: string; endpointUrl: string }, dependencies: McpIdentityDependencies): Promise<McpIdentityRecord>` in `identity-service.ts` acquires an app-scoped lease, reconciles owned provider objects, and persists each successful step.
- `McpIdentityDependencies` explicitly contains store, Graph client, approved tenant/client policy, clock, and lease provider; Graph methods create/find/inspect marked resource applications, ensure scope/service principal, and read client preauthorization status. No grant-consent method is exposed.

- [ ] Write failing tests for first creation; same-request replay; interruption after application creation but before service principal creation; parallel calls; deterministic scope IDs; wrong ownership marker; missing permission; pending admin consent; pre-created approved binding; and no writes to the shared browser/control-plane app.
- [ ] Run `npm test -- src/features/mcp-servers/identity-service.test.ts src/features/publishing/azure/mcp-identity-client.test.ts`; require the expected missing-implementation failures.
- [ ] Add the additive table/relation/migration and typed store; implement provider reconciliation with the exact Task 0 Graph permissions/operations. Persist external IDs before proceeding and audit safe IDs/outcomes. Resource/consent failure returns a safe `ACTION_REQUIRED` record; do not widen permission or audience.
- [ ] Include the owned identity in the existing deletion confirmation/preview and scoped provider removal. Preserve shared client registrations, fail on ownership mismatch, and tolerate an already deleted owned object during a replay. Make retention or deletion failures explicit.
- [ ] Run the above tests, `npm test -- src/features/app-deletion`, `npx prisma validate`, and Prisma generation. Use the repository's normal migration command on a disposable test database to validate migration compatibility. No production migration yet.
- [ ] Commit the persistence/reconciliation work after tests pass.

## Task 4: Wire identity into publishing and add MCP deployment probes

**Files:**
- Modify: `src/features/publishing/setup/{service,checks,status}.ts`, `src/features/publishing/azure/{config,runtime}.ts`, `src/features/publishing/run-publish-attempt.ts` and tests.
- Create: `src/features/mcp-servers/deployment-probe.ts`, test.
- Modify: environment reserved-key policy owning UI/MCP saves (locate via `rg 'AUTH_URL|reserved|managed' src/features/env-vars src/features/portal-mcp/environment`), corresponding tests; custom-domain mutation guard for MCP records.

**Interfaces:**
- `buildMcpRuntimeSettings(identity: McpIdentityRecord): Record<string,string>` emits only READY identity's six managed settings listed in the design; no browser Auth.js settings.
- `probeMcpDeployment(input: { endpointUrl: string; attemptId: string; commitSha: string }, deps: McpProbeDependencies): Promise<McpDeploymentProbe>` validates exact canonical provider host, public health/discovery, and unauthenticated challenge without login or tool calls.
- Store probe result/attempt/commit/timestamp with configuration records; expose `currency: "HISTORICAL_ONLY"` on every summary. No push-deployment callback, freshness inference, or live provider calls in `get_app` are added. Existing `publishStatus` remains deployment status.

- [ ] Write failing setup tests proving identity runs before runtime settings, incomplete setup prevents usable MCP publication, legacy browser callbacks still work, repair preserves IDs and never dispatches, and missing consent never silently downgrades to public.
- [ ] Write failing probe tests for correct 200/metadata/401 challenge, root-only health success rejected for MCP, wrong resource/issuer/scope, redirects, deadline, arbitrary host denied, and old attempt/commit evidence still labeled HISTORICAL_ONLY. No bearer credentials or arbitrary URL fetch inputs exist.
- [ ] Write failing environment/domain tests: all six managed MCP settings rejected in UI and MCP ordinary writes; MCP custom-domain changes blocked without affecting ordinary app domains.
- [ ] Implement bearer setup branching from trusted portal policy. Keep first publish and push-trigger behavior. Record probe results separately; distinguish failed setup, failed deployment probe, and unverified client auth in safe diagnostics. Show the recorded commit/time and HISTORICAL_ONLY currency even when PASSED; always require a current client smoke check before claiming tool connectivity.
- [ ] Run setup, runtime, run-publish-attempt, environment, domain, and new probe tests. Run `npm run build:publish-worker` to catch accidental worker dependencies. Require PASS.
- [ ] Commit the publishing integration; no live publish as part of this task without an execution-time request.

## Task 5: Expose nonsecret connection metadata in the plugin and UI

**Files:**
- Create: `src/features/mcp-servers/connection-summary.ts`, test; `src/features/app-details/mcp-connection-card.tsx`, test.
- Modify: `src/features/app-requests/{portal-summary,get-app-summary}.ts` and tests; `src/features/portal-mcp/server.test.ts`; `src/app/download/[requestId]/page.tsx`, `src/app/onboarding/[requestId]/page.tsx` and tests as appropriate.

**Interfaces:**
- `buildMcpConnectionSummary(record: McpIdentityRecord | null, deployment: McpDeploymentContext): McpConnectionSummary | null` implements the design's exact additive contract. Define `McpDeploymentContext` with kind, successful publish/URL, recorded attempt/commit evidence, and last probe.
- `PortalAppSummary.mcp` is null for other templates; endpoint URLs are null until identity READY and a successful publish. `clientVerification` is always `REQUIRED`, never inferred from a deployment probe.

- [ ] Write failing tests for ordinary app null result, unpublished/blocked/ready MCP records, exact nonsecret response shape, historical probe currency even on PASSED, owner/collaborator/admin access, and quiet `NOT_FOUND` for an inaccessible app. Assert no raw config/credential fields appear in serialization.
- [ ] Run `npm test -- src/features/mcp-servers/connection-summary.test.ts src/features/app-requests/get-app-summary.test.ts src/features/portal-mcp/server.test.ts`; confirm intended failures.
- [ ] Implement the query include/projection and additive summary. Render endpoint copy action, Entra audience, deployment evidence timestamp, host-auth verification still required, and concise Plugin Creator handoff on accessible app details. Never present the bare homepage as the MCP endpoint.
- [ ] Add onboarding/E2E coverage for the advanced fixed-audience template and post-publish connection card. If old portal fields are absent, the skill/UI handoff says unavailable/pending instead of manufacturing metadata.
- [ ] Run the new component/query tests and `npm run test:e2e -- e2e/onboarding.spec.ts`; require PASS. Commit this connection surface.

## Task 6: Integrate CU Launch skill instructions with Plugin Creator

**Files:**
- Modify: `plugins/cedarville-app-portal/skills/cedarville-app-portal-workspace/SKILL.md`, its `agents/openai.yaml` if needed, existing managed plugin release metadata, `src/features/portal-mcp/plugin-package.test.ts`.
- Create: that skill's `references/mcp-server-plugin-creator.md`; `docs/portal/mcp-agent-evaluations.md`.
- Modify: `src/features/generation/portal-skill.ts`, skill tests/fixtures as needed; emit generated MCP reference and `docs/plugin-creator-handoff.md`.

**Interfaces:**
- Apply the companion proposed skill document. `get_app.mcp` is the connection source; current authenticated MCP discovery is the tool/schema source; Plugin Creator's actual returned plugin URL/ID is the plugin identity source.
- Do not change curated Plugin Creator files. Read its installed existing-server/package instructions at execution time. Existing managed CU Launch plugin identity/App bindings stay intact.

- [ ] Add contract tests for the availability gate, explicit template choice, existing-server routing, no Sites fallback, ordinary access/replay/recovery rules preserved, source references packaged, and old response handling. Existing manifest format is managed; do not migrate it merely to add this feature.
- [ ] Run `npm test -- src/features/portal-mcp/plugin-package.test.ts src/features/generation/portal-skill.test.ts`; verify intended new assertions fail before editing skills.
- [ ] Add the reviewed routing/reference text and MCP-specific generated app guidance. Do not call Sites. Keep backend repository source out of plugin archives. Preserve canonical old skill recognition and customized app-local skills when updating generated guidance.
- [ ] Apply Task 0's verified host connection recipe. If installation is needed for OAuth, save the endpoint-based plugin first with discovery marked pending, then connect and reconcile live schemas. Do not require a nonexistent pre-install host connection or invent auth fields in portable `mcp.json`.
- [ ] Run behavior evaluations with mocked tools for: new server/new plugin; existing server/new plugin; existing server/existing plugin update; unavailable template; old metadata; pending GitHub invitation; missing Entra consent; unavailable Plugin Creator; uncertain plugin save; failed OAuth/discovery after successful deployment; and malicious tool description requesting secrets or sharing. Record expected tool traces and results in the evaluation document.
- [ ] Inspect a sample portable plugin package produced through the current Plugin Creator format: actual Azure endpoint, proper transport, valid manifests/skills, no credentials/dependencies/server bundle, no CU Launch control-plane URL or invented App binding. Preserve an existing plugin's identity and sharing in the update scenario.
- [ ] Run skill/package/generation suites, require PASS, and commit instructions plus evaluations. Source changes do not prove installed plugin availability; rollout occurs separately.

## Task 7: Validate and release the complete flow

**Files:**
- Modify: `README.md`, `docs/portal/{setup,template-authoring,codex-workspace-plugin,technical-operations}.md`, pilot/runbook docs, catalog activation and managed plugin release metadata.
- Create: `docs/portal/mcp-servers.md` with server authoring, secure connection, identity/consent operations, readiness distinctions, limitations, and rollback.

- [ ] Complete a spec coverage review: each acceptance gate has test/evidence; no implicit public mode, broker, machine credentials, or Sites route. Reconcile the generated engine with the Task 0 pinned versions and actual host support.
- [ ] Run targeted catalog/creation/generation/import/manifest/setup/worker/skill/deletion/environment checks after all integration edits. Required regression commands include `npm test -- src/features/repository-imports/publishing-bundle.test.ts src/features/repository-imports/compatibility.test.ts src/features/repository-imports/prepare-repository.test.ts`, `npm test`, `npm run build`, and `npm run build:publish-worker`. Require PASS, then stop repeating passing checks unless new evidence warrants it.
- [ ] Render a final generated MCP snapshot and rerun its `npm ci`, `npm test`, and production build. Inspect its deploy artifact, dependency lockfile, app-local guidance, discovery routes, and secret-free handoff.
- [ ] Document operator permissions/client enrollment, guest admission policy, ownership-scoped resource lifecycle, consent setup, custom-domain restriction, and the operator-prepared fallback if automatic provisioning was not approved. Existing browser template setup remains unchanged.
- [ ] In an authorized pilot deployment, use the actual CU Launch plugin to discover/select/create/customize/publish. Use Plugin Creator's actual existing-server route to save/update a private test plugin and verify its harmless tool after connection. Verify the intended hosts separately. Record partial outcomes honestly and do not broaden sharing.
- [ ] Activate the template only after these gates pass. Seed through the existing env-loading script. Roll out portal/schema/worker changes through the existing deployment path; release the CU Launch plugin through its managed release process. Verify both versions are available before announcing the feature.
- [ ] Include an eventual implementation commit entry such as `Release-note: Host Cedarville-authenticated MCP servers on Azure and connect them to your own plugins.` Run `npm run release-notes:generate` for implementation preview; inspect generated changes before including them. This planning-only change does not require generated release notes.
- [ ] Rollback drill: disable new template creation and revert the skill release if needed; retain existing server resources/identities and inspect safe evidence. Use scoped deletion only on an explicit request.

## Plan review and handoff

Proposed task order is sequential because identity, runtime, setup, and connection contracts depend on one another. Native execution is sufficient; delegate only when explicitly selected or required for a review. Do not begin by creating Azure resources or publishing plugins merely because this plan exists.

Coverage: template/discovery/policy → Task 1; generated server/auth/manifest → Task 2; identity lifecycle → Task 3; setup/probes/settings → Task 4; UI/API handoff → Task 5; plugin instructions and packaging → Task 6; integrated acceptance/release → Task 7. Host feasibility is the Task 0 gate. No product code, migration, test plugin, or cloud resource was created while writing the original plan. Local implementation subsequently added the inactive template, migration, portal/plugin integration, tests, and runbooks; no live resources or user plugins have been created.
