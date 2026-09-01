# Codex Portal Workspace Plugin Design

**Date:** 2026-09-01

**Status:** Approved design

## Purpose

Build a university-distributed Codex plugin that lets Cedarville employees use the Cedarville App Portal directly from Codex. The first release supports creating a new app from an approved portal template, obtaining access to the portal-managed GitHub repository, optionally customizing that repository with Codex, and explicitly publishing the app to Azure.

The plugin makes the portal UI optional for this workflow. It does not remove, replace, or modify any portal UI. Existing browser workflows continue to use the same underlying application services and remain fully supported.

## Scope

### Included

- Cedarville employee sign-in for each plugin user.
- Discovery of the current active portal templates and their supported choices.
- Creation of a template-backed app and private portal-managed GitHub repository.
- Actor-specific GitHub repository access using the portal's GitHub App integration.
- Optional Codex customization through ordinary local Git after repository access is ready.
- Explicit, separate Azure publishing.
- App, repository, publishing setup, and publish-attempt status retrieval.
- Publishing setup repair and failed-publish retry after explicit user approval.
- Workspace distribution through a GitHub-managed Codex plugin marketplace.
- Audit, idempotency, rate limiting, safe errors, operational documentation, and tests.

### Excluded

- Adding or importing an existing GitHub app.
- Uploading an existing local-only app.
- Collaborator invitation or removal.
- Environment-variable management.
- Push-to-deploy configuration.
- App or external-resource deletion.
- Changes to portal pages, components, copy, navigation, or browser behavior.
- A shared university service identity for user operations.
- Direct GitHub or Azure credentials in the skill or tool results.

These exclusions keep the initial plugin focused on a complete, secure new-app path. The existing portal UI remains available for excluded workflows.

## Product Decisions

1. Every user signs in with an individual Cedarville identity. App ownership, collaboration permissions, audit records, GitHub access, and publishing actions remain attributable to the employee who initiated them.
2. The first release creates apps only from active portal templates.
3. Creation stops after the private managed GitHub repository is ready or has reached a safe failure state.
4. Azure publishing requires a later, explicit user request. Creating an app never implicitly publishes it.
5. Codex may customize the managed repository between creation and publishing, but customization is optional.
6. Repair and retry actions are never automatic. Codex explains the state and obtains explicit approval first.
7. Existing UI server actions and MCP tools call the same shared application services so their business rules cannot drift.

## Architecture

The deliverable is a Codex plugin that combines a workflow skill with a remote Model Context Protocol server hosted by the portal.

The plugin is the university distribution unit. Its skill teaches Codex the approved decision sequence, confirmation boundaries, Git workflow, and stopping conditions. Its registered app connection points to the portal's MCP server. The MCP server owns live data access, authentication, authorization, validation, and controlled GitHub and Azure operations.

The portal exposes a stable HTTPS Streamable HTTP endpoint at `/api/mcp`. It also publishes the protected-resource metadata required for MCP OAuth discovery. The server uses the official TypeScript MCP SDK and Zod schemas.

The portal's current server actions contain orchestration that is also needed by the MCP tools. That orchestration will be extracted into focused application services. Browser server actions become thin adapters that resolve the Auth.js user, invoke a service, and revalidate browser views. MCP tools resolve an Entra bearer-token principal, invoke the same service, and return structured tool results. UI rendering code is not touched.

## Repository Structure

The implementation uses the following file boundaries:

```text
src/
  app/
    api/mcp/route.ts                         Streamable HTTP MCP route
    .well-known/oauth-protected-resource/
      route.ts                               MCP resource metadata
  features/
    portal-api/
      auth.ts                                Entra bearer-token validation
      principal.ts                           User synchronization and actor context
      errors.ts                              Safe, stable application error contract
      idempotency.ts                         Mutation replay protection
      rate-limit.ts                          Per-user mutation limits
    portal-mcp/
      server.ts                              MCP server construction and instructions
      tools/                                 One adapter per focused tool
    app-requests/
      create-generated-app.ts                Shared template-app creation service
      get-app-summary.ts                     Authorized app read model
      list-accessible-apps.ts                Authorized app listing
    repositories/
      grant-repository-access.ts             Shared actor-specific access service
    publishing/
      queue-publish.ts                       Shared initial/republish queue service
      repair-publishing-setup.ts             Shared repair service
      retry-publish.ts                       Shared retry service
prisma/
  schema.prisma                              Idempotency and rate-limit persistence
  migrations/                                Database migration
plugins/
  cedarville-app-portal/
    .codex-plugin/plugin.json                Stable plugin identity and metadata
    .app.json                                Real registered MCP app identifier
    skills/cedarville-app-portal/SKILL.md    Distributable workflow skill
.agents/plugins/marketplace.json             University GitHub marketplace catalog
docs/portal/                                 Setup and operations documentation
```

No `.app.json` placeholder is committed. That file is added only after the deployed MCP server has been registered and the real `plugin_asdk_app...` identifier is available.

## Authentication and Identity

The plugin uses Cedarville Microsoft Entra sign-in through OAuth authorization code flow with PKCE. The deployment uses a dedicated delegated API scope for the portal MCP resource and a predefined OpenAI OAuth client registration where required by the plugin connection.

The portal validates every bearer token before MCP initialization or tool execution. Validation requires:

- The configured Cedarville tenant and issuer.
- The configured MCP API audience.
- A valid signature from the issuer's current JWKS.
- Current `nbf` and `exp` validity.
- The required delegated scope in `scp`.
- A stable Entra object identifier in `oid`.
- A Cedarville `preferred_username` or `email` claim issued by the configured tenant.
- No application-only token in place of a delegated user token.

After validation, the portal resolves the actor by Entra object ID and synchronizes safe profile fields using the same identity semantics as browser sign-in. The actor context is passed explicitly to shared services; MCP services do not depend on an Auth.js browser cookie.

The production rollout is blocked until a real OpenAI-host-to-Entra test proves:

- OAuth metadata discovery.
- Authorization-code flow with PKCE S256.
- Correct redirect URI registration.
- Resource and audience binding.
- Delegated scope issuance.
- Cedarville domain restriction.
- Token validation by the deployed MCP endpoint.

If the configured Entra registration cannot meet the current MCP authorization contract, rollout stops. The implementation does not weaken audience validation, substitute a shared identity, or invent a custom token scheme. A standards-compliant authorization broker would require a separate reviewed design.

## Authorization

Shared services accept an explicit actor and enforce the existing portal access model:

- Owners can manage their own apps.
- Accepted collaborators can perform only the operations already allowed to collaborators.
- Portal administrators retain their existing elevated access.
- App reads and mutations use the existing access predicate rather than trusting a tool-supplied owner or email.
- Unknown, missing, and inaccessible app IDs return the same quiet not-found result.
- Every GitHub and Azure operation rechecks access immediately before the external mutation.
- Repository access results remain actor-specific and are not inferred from a shared last-write status.

The E2E browser-auth bypass never authorizes production MCP requests. MCP authentication tests use explicit signed-token fixtures and test-only issuer/JWKS configuration.

## MCP Tools

### `list_app_templates`

Returns active templates, names, descriptions, decision summaries, categories, supported hosting target, database rules, Cedarville-login capability, public-access capability, and only the input choices the caller may select. It is read-only and does not expose internal template paths or provider credentials.

### `list_my_apps`

Returns concise summaries of apps accessible to the actor, including stable request ID, name, template, repository state, publish state, safe links, support reference, and allowed next actions. It does not expose another user's inaccessible records.

### `create_app`

Accepts a caller-generated idempotency key and the validated template input: template slug, app name, description, hosting target fixed by the template, database selection allowed by the template, audience choice, and public acknowledgement when required.

It uses the current template catalog and existing create schema, persists the template version, creates the app request, builds the source snapshot, bootstraps the private managed GitHub repository, records audit events, and sends the existing lifecycle notifications. It never publishes. Its result includes the request ID, support reference, generation state, repository state, repository URL when ready, and allowed next actions.

### `get_app`

Returns the current authorized app summary, repository metadata safe for the actor, actor-specific repository access outcome, publishing setup state, latest publish attempt summary, safe links, and allowed next actions.

### `request_github_access`

Accepts the app request ID, caller-generated idempotency key, and GitHub username. It validates the username, saves it to the actor's profile, rechecks app access and repository readiness, invokes the existing GitHub App grant/invite behavior, persists the actor-specific outcome, audits the request with `source: "codex-mcp"`, and returns `GRANTED`, `INVITED`, or a safe `FAILED` result.

### `publish_app_to_azure`

Accepts the app request ID and caller-generated idempotency key. The skill permits this call only after the user separately and explicitly asks to publish. The service rechecks access and publish eligibility, atomically claims the app state, creates a publish attempt, starts the existing publishing workflow, and returns the attempt ID and queued state without waiting for deployment completion.

### `get_publish_status`

Returns the authorized attempt status, stage, safe failure summary, support reference, workflow URL when safe, live app URL after success, and allowed next actions. It is read-only.

### `repair_publishing_setup`

Accepts the app request ID and caller-generated idempotency key. It is callable only after Codex explains why repair is appropriate and the user explicitly approves it. It reuses the portal's existing repair eligibility and atomic claim behavior. It refreshes portal-managed setup without deleting resources or dispatching a deployment.

### `retry_publish`

Accepts the app request ID and caller-generated idempotency key. It is callable only for a failed publish after explicit user approval. It reuses the current retry eligibility rules and returns a new attempt ID.

## Skill Behavior

The distributable skill is concise and workflow-oriented. It instructs Codex to:

1. Use portal tools rather than browser automation for included workflows.
2. List current templates before recommending one.
3. Ask plain-language questions one at a time and only for choices the selected template permits.
4. Preserve exact audience semantics: Cedarville sign-in or openly public access.
5. Explain public access and obtain the required acknowledgement.
6. Summarize the creation inputs and obtain explicit approval before creating the app.
7. Stop at the GitHub repository boundary after creation.
8. Ask whether the user wants to publish the unchanged starter or customize it first.
9. Request GitHub access only when local customization is needed.
10. Use ordinary local Git for cloning, changes, tests, commits, and pushes; never request passwords, personal access tokens, private keys, or portal secrets.
11. Require a separate explicit request before the first publish, republish, repair, or retry.
12. Poll with bounded intervals and stop on success, safe failure, authentication requirement, or user/administrator action.
13. Report verified, partial, and blocked outcomes accurately.
14. Direct the user to the existing portal UI for excluded first-release functions.

The plugin skill is distinct from the app-local `cu-app-portal` skill generated inside managed repositories. The workspace skill creates and operates portal records. The app-local skill governs work inside one already-managed application repository. Their names, descriptions, and routing language must make that boundary unambiguous.

## Idempotency and Concurrency

Every mutating tool requires a caller-generated UUID that remains stable for one logical user-approved operation. The portal stores a record keyed by actor, operation name, and idempotency key.

An idempotency record stores the input digest, state, linked app or publish-attempt identifier, safe result, and timestamps. Reusing a key with identical input returns the existing result. Reusing a key with different input returns `CONFLICT`. Concurrent claims allow only one worker to execute the external mutation.

Idempotency complements, rather than replaces, the app-state atomic claims already used for repository retries, publishing setup, and publish attempts. The service checks both the idempotency record and current domain state before each external operation.

## Rate Limiting

Rate limits are persisted in the portal database so multiple portal instances enforce the same policy. The initial per-user limits are:

- Read-only tools: 120 calls per rolling 10 minutes.
- App creation: 3 calls per rolling hour.
- GitHub access requests: 10 calls per rolling hour.
- Initial publish or republish requests: 6 calls per rolling hour.
- Publishing setup repair: 3 calls per rolling hour.
- Failed-publish retry: 6 calls per rolling hour.

Successful idempotent replays return the stored result without consuming another mutation allowance. Rejected changed-input replays and concurrent duplicate claims do consume an allowance because they represent distinct unsafe attempts.

Rate-limit responses include a safe retry-after duration. They do not cause Codex to retry a mutation automatically. Operations owners may lower these values through validated configuration; raising them requires a reviewed configuration change and load evidence.

## Errors and Results

Tool failures use stable structured codes:

- `INVALID_INPUT`: a safe field-level explanation.
- `AUTHENTICATION_REQUIRED`: sign-in or relinking is required.
- `FORBIDDEN`: the authenticated user lacks an operation-level permission.
- `NOT_FOUND`: quiet response for missing or inaccessible apps.
- `CONFLICT`: the state changed, a different request reused an idempotency key, or an operation is already running.
- `ACTION_REQUIRED`: user or administrator action is required.
- `SETUP_REPAIR_REQUIRED`: publishing prerequisites require repair.
- `RATE_LIMITED`: the user must wait before initiating another operation.
- `PROVIDER_FAILURE`: a safe provider-independent summary and support reference.

Raw exceptions, tokens, credentials, private provider responses, and secret values never appear in tool results. Logs use request, actor, app, operation, and support identifiers without bearer tokens or sensitive input values.

Tool results use structured content with stable identifiers and a short human-readable summary. They expose allowed next actions so Codex does not infer an unsafe transition from status strings.

## Auditing and Notifications

Existing app, repository, and publishing audit events remain authoritative. MCP-initiated mutations add the source `codex-mcp`, actor ID, operation name, and idempotency key. Authentication failures and rate-limit decisions receive security telemetry without logging the bearer token.

Existing lifecycle and publishing notification behavior is preserved because UI and MCP adapters invoke the same services. The plugin does not add a second notification system.

## Workspace Distribution

The plugin lives under `plugins/cedarville-app-portal` and has a stable kebab-case name and semantic version. The repository marketplace at `.agents/plugins/marketplace.json` references that local plugin path. A Cedarville workspace administrator imports the GitHub repository or marketplace path, configures eligible roles, and selects installation and authentication policy.

The deployed MCP endpoint is first registered in ChatGPT developer mode. The issued technical app identifier is then added to the plugin's `.app.json`, and the plugin manifest references that app mapping. The real identifier is an administrator-owned deployment value and is not guessed.

The initial rollout uses a limited university role or pilot group. After authentication, authorization, creation, GitHub access, publishing, audit, and cleanup have been verified, the administrator may expand availability. Workspace distribution remains private to the Cedarville workspace; this project does not require public plugin-directory submission.

## Configuration and Operations

Portal configuration gains explicit MCP values for:

- Public MCP resource URL.
- Cedarville Entra tenant and issuer.
- Dedicated MCP API audience.
- Required delegated scope.
- Allowed Cedarville email domain.
- OAuth protected-resource metadata.
- Mutation rate-limit thresholds.

Configuration validation fails closed when required production values are missing or inconsistent. Setup documentation covers Entra app/API registration, delegated permission exposure and consent, redirect URI registration, portal environment configuration, workspace MCP registration, marketplace import, role assignment, smoke tests, monitoring, token/key rotation behavior, and rollback.

Rollback disables the plugin in the workspace and, when necessary, disables the dedicated delegated API scope or MCP route configuration. It does not remove portal app records, GitHub repositories, or Azure resources created through successful prior operations.

## Testing Strategy

Implementation follows test-driven development. Each new behavior starts with a focused failing test that proves the missing behavior.

### Shared-service regression coverage

- Existing create UI tests remain unchanged in behavior while the action delegates to the new creation service.
- Existing repository access tests remain unchanged in behavior while the action delegates to the shared access service.
- Existing publishing action tests remain unchanged in behavior while actions delegate to shared queue, repair, and retry services.
- No UI snapshot or route expectation changes.

### Authentication coverage

- Valid delegated Cedarville token.
- Invalid signature.
- Wrong issuer or tenant.
- Wrong audience.
- Missing delegated scope.
- Application-only token.
- Expired or not-yet-valid token.
- Missing object ID.
- Missing, unverified, or non-Cedarville email.
- JWKS rotation and unknown key ID.
- E2E browser bypass does not authorize MCP.

### Authorization coverage

- Owner, collaborator, and administrator access.
- Foreign and missing app IDs return the same quiet result.
- Access is revalidated immediately before GitHub and Azure mutations.
- Actor-specific GitHub access outcomes remain isolated.

### Mutation safety coverage

- Identical idempotent replay returns the stored result.
- Changed input under the same key returns `CONFLICT`.
- Concurrent creates produce one app and one repository bootstrap.
- Concurrent publishes produce one attempt.
- Rate limits apply across simulated portal instances.
- Provider failure persists a safe terminal state and support reference.

### MCP contract coverage

- Initialization and server instructions.
- Exact tool inventory.
- Input and output schemas.
- Accurate read-only, destructive, and open-world annotations.
- Structured results and stable error codes.
- No secrets or excess personal data in results.
- Representative valid, invalid, edge-case, and out-of-scope calls.

### Skill behavior coverage

Skill testing uses realistic baseline and post-skill scenarios for:

- Direct publish of an unchanged starter.
- Customize-first flow.
- Pressure to publish during creation.
- Duplicate mutation calls.
- Public-app acknowledgement.
- Foreign-app access.
- Failed publishing setup.
- Repair and retry without approval.
- Requests for excluded import, deletion, or collaborator workflows.

### Final verification

- Focused Vitest suites for each changed service and route.
- Full `npm test`.
- `npm run build`.
- Prisma migration validation.
- Skill validation and plugin manifest validation.
- MCP Inspector initialization and representative tool calls.
- ChatGPT/Codex developer-mode connection with real Cedarville sign-in.
- Production pilot creating a disposable template app, obtaining GitHub access, publishing it, verifying the live URL, and recording exact resources for separately approved cleanup.
- `git diff --check` and an explicit review that no portal UI file changed.

## Deployment Gates and Handoffs

Code completion and production enablement are distinct:

1. The repository can implement and verify shared services, MCP transport, authentication validation, tools, skill, plugin skeleton, marketplace, migration, and documentation locally.
2. An Entra administrator must configure the dedicated API/client registration, delegated scope, consent, and exact redirect URI.
3. The deployed MCP server must pass the real OpenAI-host-to-Entra authorization test.
4. A workspace/plugin administrator must register the deployed MCP connection and provide the real `plugin_asdk_app...` identifier.
5. The plugin package is finalized with that identifier and validated.
6. A restricted pilot role completes the end-to-end smoke test.
7. Broader workspace distribution occurs only after the pilot evidence is reviewed.

No completion claim may describe administrator registration, production OAuth, workspace publication, or live Azure publishing as verified unless that exact gate was exercised successfully.

## Documentation Sources

- OpenAI, [Build skills](https://developers.openai.com/plugins/build/skills)
- OpenAI, [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- OpenAI, [Authentication](https://developers.openai.com/plugins/build/auth)
- OpenAI, [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- OpenAI, [Workspace plugin management](https://learn.chatgpt.com/docs/enterprise/plugin-management)
- OpenAI, [Skill controls](https://learn.chatgpt.com/docs/enterprise/skills)
- Microsoft, [OAuth 2.0 authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- Microsoft, [Authorize applications, resources, and workloads](https://learn.microsoft.com/en-us/entra/architecture/authorize-applications-resources-workloads)
