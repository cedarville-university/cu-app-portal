# Codex Portal Workspace Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cedarville-authenticated, workspace-distributed Codex plugin that creates approved template apps through the portal's managed GitHub flow and publishes them to Azure only after a separate explicit request.

**Architecture:** Extract the existing create, repository-access, publish, and repair orchestration into actor-aware application services shared by the browser server actions and a new stateless MCP endpoint. Protect MCP calls with delegated Entra JWT validation, database-backed idempotency and rate limiting, then package the tools with a concise workflow skill in a GitHub-managed university plugin marketplace.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma/PostgreSQL, Vitest, Zod, `jose`, `mcp-handler` 2, MCP TypeScript SDK 2, Microsoft Entra ID, existing GitHub App and Azure publishing services.

**Spec:** `docs/superpowers/specs/2026-09-01-codex-portal-workspace-plugin-design.md`

## Global Constraints

- Do not modify portal pages, components, copy, navigation, styles, or browser behavior.
- Do not touch or stage the user's existing changes in `src/app/download/[requestId]/page.test.tsx`, `src/app/onboarding/[requestId]/page.test.tsx`, `src/features/publishing/eligibility.test.ts`, or `src/features/publishing/eligibility.ts` unless the user separately authorizes resolving a direct conflict.
- Template creation only; existing GitHub imports and local-app uploads remain outside the plugin.
- Creation stops after the private managed repository is ready or safely failed. It never publishes.
- Initial publish, republish, repair, and retry each require a separate explicit user request.
- MCP uses an individual delegated Cedarville identity, never a shared service identity.
- Validate token signature, issuer, tenant, audience, time, delegated scope, object ID, and Cedarville email claim on every MCP request.
- Recheck portal access immediately before every GitHub or Azure mutation.
- Unknown, missing, and inaccessible app IDs have identical quiet-not-found behavior.
- Never expose credentials, bearer tokens, secret values, raw provider errors, or unnecessary personal data in tool output or logs.
- `E2E_AUTH_BYPASS=true` must never authorize MCP.
- Every mutating tool requires a stable caller-generated UUID idempotency key.
- Initial per-user limits are: reads 120/10 minutes; create 3/hour; GitHub access 10/hour; publish 6/hour; repair 3/hour; retry 6/hour.
- Do not commit `.app.json` until the real registered `plugin_asdk_app...` identifier is supplied.
- The app-local generated `cu-app-portal` skill remains distinct from the workspace plugin skill.
- Use Node.js 24+, npm, test-first changes, focused checks, full `npm test`, `npm run build`, and `git diff --check`.
- Stage only the files explicitly listed in each task's commit step.

---

### Task 1: Add MCP dependencies and persistence models

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260901120000_add_portal_api_safety/migration.sql`
- Create: `src/features/portal-api/persistence.test.ts`

**Interfaces:**
- Consumes: existing `User` records as the actor identity.
- Produces: Prisma models `PortalApiOperation` and `PortalApiRateLimitEvent`, plus enum `PortalApiOperationState`.

- [ ] **Step 1: Write the failing schema-contract test**

Create `src/features/portal-api/persistence.test.ts` with assertions that read `prisma/schema.prisma` and require the unique replay key, operation result fields, expiry indexes, actor relations, and rate-event index:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");

describe("portal API persistence schema", () => {
  it("stores idempotent operations per actor and operation", () => {
    expect(schema).toContain("model PortalApiOperation");
    expect(schema).toContain("@@unique([actorUserId, operation, idempotencyKey])");
    expect(schema).toContain("safeResult       Json?");
    expect(schema).toContain("expiresAt        DateTime");
  });

  it("stores expiring rate-limit events", () => {
    expect(schema).toContain("model PortalApiRateLimitEvent");
    expect(schema).toContain("@@index([actorUserId, action, createdAt])");
    expect(schema).toContain("@@index([expiresAt])");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/features/portal-api/persistence.test.ts`

Expected: FAIL because neither model exists.

- [ ] **Step 3: Add the Prisma models and migration**

Add these exact schema shapes and reciprocal `User` relations:

```prisma
enum PortalApiOperationState {
  PENDING
  SUCCEEDED
  FAILED
}

model PortalApiOperation {
  id               String                  @id @default(cuid())
  actorUserId      String
  operation        String
  idempotencyKey   String
  inputDigest      String
  state            PortalApiOperationState @default(PENDING)
  appRequestId     String?
  publishAttemptId String?
  safeResult       Json?
  errorCode        String?
  expiresAt        DateTime
  createdAt        DateTime                @default(now())
  updatedAt        DateTime                @updatedAt
  actor            User                    @relation(fields: [actorUserId], references: [id], onDelete: Cascade)

  @@unique([actorUserId, operation, idempotencyKey])
  @@index([expiresAt])
}

model PortalApiRateLimitEvent {
  id          String   @id @default(cuid())
  actorUserId String
  action      String
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  actor       User     @relation(fields: [actorUserId], references: [id], onDelete: Cascade)

  @@index([actorUserId, action, createdAt])
  @@index([expiresAt])
}
```

Create matching SQL with the enum, tables, unique/index definitions, and `ON DELETE CASCADE` foreign keys. Add `portalApiOperations PortalApiOperation[]` and `portalApiRateLimitEvents PortalApiRateLimitEvent[]` to `User`.

- [ ] **Step 4: Install protocol and token dependencies**

Run: `npm install mcp-handler@^2 @modelcontextprotocol/sdk@^2 jose@^6 zod@^4`

Expected: `package.json` and `package-lock.json` pin compatible versions. Immediately run `npm test -- src/features/create-app/validation.test.ts` to catch a Zod 4 compatibility regression before proceeding.

- [ ] **Step 5: Generate Prisma and verify GREEN**

Run: `npm run prisma:generate`

Run: `npm test -- src/features/portal-api/persistence.test.ts src/features/create-app/validation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the persistence foundation**

```bash
git add package.json package-lock.json prisma/schema.prisma prisma/migrations/20260901120000_add_portal_api_safety/migration.sql src/features/portal-api/persistence.test.ts
git commit -m "feat: add portal API safety persistence"
```

### Task 2: Implement safe errors, idempotency, and distributed rate limits

**Files:**
- Create: `src/features/portal-api/errors.ts`
- Create: `src/features/portal-api/errors.test.ts`
- Create: `src/features/portal-api/stable-json.ts`
- Create: `src/features/portal-api/idempotency.ts`
- Create: `src/features/portal-api/idempotency.test.ts`
- Create: `src/features/portal-api/rate-limit.ts`
- Create: `src/features/portal-api/rate-limit.test.ts`

**Interfaces:**
- Consumes: `PortalApiOperation`, `PortalApiRateLimitEvent`, `Prisma.InputJsonValue`.
- Produces: `PortalApiError`, `executeIdempotentMutation<TInput,TResult>()`, and `claimPortalRateLimit()`.

- [ ] **Step 1: Write failing safe-error tests**

```ts
import { describe, expect, it } from "vitest";
import { PortalApiError, toSafePortalApiError } from "./errors";

describe("portal API errors", () => {
  it("preserves stable safe errors", () => {
    expect(toSafePortalApiError(new PortalApiError("NOT_FOUND", "App not found.")))
      .toEqual({ code: "NOT_FOUND", message: "App not found.", retryAfterSeconds: null });
  });

  it("hides unknown exceptions", () => {
    expect(toSafePortalApiError(new Error("Azure secret: abc"))).toEqual({
      code: "PROVIDER_FAILURE",
      message: "The portal could not complete this operation.",
      retryAfterSeconds: null,
    });
  });
});
```

Run: `npm test -- src/features/portal-api/errors.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement the error contract**

Define exactly:

```ts
export type PortalApiErrorCode =
  | "INVALID_INPUT" | "AUTHENTICATION_REQUIRED" | "FORBIDDEN"
  | "NOT_FOUND" | "CONFLICT" | "ACTION_REQUIRED"
  | "SETUP_REPAIR_REQUIRED" | "RATE_LIMITED" | "PROVIDER_FAILURE";

export class PortalApiError extends Error {
  constructor(
    readonly code: PortalApiErrorCode,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) { super(message); this.name = "PortalApiError"; }
}
```

`toSafePortalApiError()` returns only `{code,message,retryAfterSeconds}` and maps all unknown exceptions to the generic provider failure above.

- [ ] **Step 3: Write failing idempotency and concurrency tests**

Use an injected store to prove: stable key + identical input replays a succeeded result; changed input raises `CONFLICT`; a pending duplicate raises `CONFLICT`; only the first claim calls `execute`; safe failures are persisted; UUID validation rejects invalid keys.

```ts
const result = await executeIdempotentMutation({
  actorUserId: "user-1",
  operation: "create_app",
  idempotencyKey: "53b6240b-2f6f-4ab8-bf70-3458b861bf3f",
  input: { appName: "Test" },
  expiresInSeconds: 604800,
  claimRateLimit: vi.fn(),
  execute: vi.fn().mockResolvedValue({ requestId: "req-1" }),
  store,
});
expect(result).toEqual({ requestId: "req-1" });
```

Run: `npm test -- src/features/portal-api/idempotency.test.ts`

Expected: FAIL because the executor does not exist.

- [ ] **Step 4: Implement canonical digesting and mutation execution**

`stable-json.ts` recursively sorts object keys, preserves array order, rejects `undefined`, functions, symbols, and non-finite numbers, then hashes UTF-8 JSON with SHA-256. Implement:

```ts
export async function executeIdempotentMutation<TInput, TResult>(options: {
  actorUserId: string;
  operation: string;
  idempotencyKey: string;
  input: TInput;
  expiresInSeconds: number;
  claimRateLimit: () => Promise<void>;
  execute: () => Promise<TResult>;
  store?: PortalApiOperationStore;
}): Promise<TResult>;
```

The default store uses Prisma. Check an existing record before rate limiting. A matching `SUCCEEDED` record returns `safeResult`; matching `FAILED` returns its stored safe error; changed input and `PENDING` duplicates claim rate limit and then throw `CONFLICT`. A new operation claims rate limit, creates `PENDING` with a unique key, executes once, and persists `SUCCEEDED` or the safe `FAILED` result. Never auto-take over an abandoned `PENDING` operation.

- [ ] **Step 5: Write failing distributed rate-limit tests**

Test all six exact policies and verify the N+1 call raises `RATE_LIMITED` with a positive retry duration. Test that expired rows are ignored and cleaned up.

```ts
expect(PORTAL_API_RATE_LIMITS.create_app).toEqual({ limit: 3, windowSeconds: 3600 });
expect(PORTAL_API_RATE_LIMITS.read).toEqual({ limit: 120, windowSeconds: 600 });
```

Run: `npm test -- src/features/portal-api/rate-limit.test.ts`

Expected: FAIL because the policy and claim function do not exist.

- [ ] **Step 6: Implement the rate limiter**

Export policies for `read`, `create_app`, `request_github_access`, `publish_app_to_azure`, `repair_publishing_setup`, and `retry_publish`. `claimPortalRateLimit(actorUserId, action, now, db)` opens a Prisma transaction, obtains `pg_advisory_xact_lock(hashtextextended(actorUserId || ':' || action, 0))`, deletes expired rows for that actor/action, counts rows since the rolling-window start, throws `RATE_LIMITED` when full, otherwise inserts an event whose `expiresAt` is the window end.

Add `loadPortalApiRateLimits(env)` with optional maximum overrides `PORTAL_MCP_RATE_READ_MAX`, `PORTAL_MCP_RATE_CREATE_MAX`, `PORTAL_MCP_RATE_GITHUB_ACCESS_MAX`, `PORTAL_MCP_RATE_PUBLISH_MAX`, `PORTAL_MCP_RATE_REPAIR_MAX`, and `PORTAL_MCP_RATE_RETRY_MAX`. Each override must be a positive integer no greater than its approved default; window durations are fixed and not configurable.

- [ ] **Step 7: Verify and commit**

Run: `npm test -- src/features/portal-api/errors.test.ts src/features/portal-api/idempotency.test.ts src/features/portal-api/rate-limit.test.ts`

Expected: PASS.

```bash
git add src/features/portal-api/errors.ts src/features/portal-api/errors.test.ts src/features/portal-api/stable-json.ts src/features/portal-api/idempotency.ts src/features/portal-api/idempotency.test.ts src/features/portal-api/rate-limit.ts src/features/portal-api/rate-limit.test.ts
git commit -m "feat: protect portal API mutations"
```

### Task 3: Validate delegated Entra identities and resolve portal actors

**Files:**
- Create: `src/features/portal-api/config.ts`
- Create: `src/features/portal-api/config.test.ts`
- Create: `src/features/portal-api/auth.ts`
- Create: `src/features/portal-api/auth.test.ts`
- Create: `src/features/portal-api/principal.ts`
- Create: `src/features/portal-api/principal.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Entra bearer JWT, remote or injected JWKS, `User`, `UserRole`.
- Produces: `PortalApiConfig`, `ValidatedEntraPrincipal`, `PortalActor`, `authenticatePortalApiRequest()`.

- [ ] **Step 1: Write failing configuration tests**

Require fail-closed parsing for:

```ts
type PortalApiConfig = {
  enabled: boolean;
  resourceUrl: string;
  tenantId: string;
  issuer: string;
  audience: string;
  requiredScope: string;
  allowedEmailDomain: "cedarville.edu";
};
```

When `PORTAL_MCP_ENABLED` is not `true`, return `{ enabled: false }` without loading secrets. When enabled, require `PORTAL_MCP_RESOURCE_URL`, `PORTAL_MCP_ENTRA_TENANT_ID`, `PORTAL_MCP_ENTRA_ISSUER`, `PORTAL_MCP_ENTRA_AUDIENCE`, and `PORTAL_MCP_ENTRA_SCOPE`; require HTTPS outside test/development.

Run: `npm test -- src/features/portal-api/config.test.ts`

Expected: FAIL because config loading does not exist.

- [ ] **Step 2: Implement config and document env names**

Add blank/disabled identity examples and all six rate-limit override names to `.env.example`; use the approved defaults for rate limits and do not add real tenant, audience, or registration values.

- [ ] **Step 3: Write failing signed-token tests**

Use `jose` `generateKeyPair`, `exportJWK`, and `SignJWT` to test valid delegated claims and each rejection: bad signature, issuer, `tid`, audience, expiry, future `nbf`, missing `scp`, app-only `roles`, missing `oid`, missing email, and non-Cedarville email.

The valid payload is:

```ts
{
  tid: "tenant-1",
  oid: "entra-user-1",
  aud: "api://portal-mcp",
  scp: "Portal.Codex",
  preferred_username: "person@cedarville.edu",
  name: "Portal Person",
}
```

Also set `E2E_AUTH_BYPASS=true` in one test and prove a missing bearer token still returns `AUTHENTICATION_REQUIRED`.

Run: `npm test -- src/features/portal-api/auth.test.ts`

Expected: FAIL because token validation does not exist.

- [ ] **Step 4: Implement bearer validation**

Implement:

```ts
export type ValidatedEntraPrincipal = {
  entraOid: string;
  email: string;
  displayName: string;
};

export async function validatePortalApiBearerToken(
  authorization: string | null,
  config: EnabledPortalApiConfig,
  dependencies?: { jwks?: JWTVerifyGetKey },
): Promise<ValidatedEntraPrincipal>;
```

Use `createRemoteJWKSet(new URL(`${issuer}/discovery/v2.0/keys`))` by default and `jwtVerify` with exact issuer and audience. Require `tid`, exact scope membership from space-separated `scp`, `oid`, and normalized `preferred_username ?? email` ending in exactly `@cedarville.edu`. Do not log the token or decoded payload.

- [ ] **Step 5: Write failing actor-resolution tests**

Prove `resolvePortalActor()` upserts by `entraOid`, updates email/display name, and returns `isAdmin` from `userHasAdminRole()`.

```ts
export type PortalActor = {
  userId: string;
  entraOid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
};
```

- [ ] **Step 6: Implement request authentication and verify**

`authenticatePortalApiRequest(request)` loads enabled config, validates `Authorization`, resolves the actor, and returns `{actor, config}`. A disabled route raises a safe `NOT_FOUND`; it never consults Auth.js or the E2E bypass.

Run: `npm test -- src/features/portal-api/config.test.ts src/features/portal-api/auth.test.ts src/features/portal-api/principal.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .env.example src/features/portal-api/config.ts src/features/portal-api/config.test.ts src/features/portal-api/auth.ts src/features/portal-api/auth.test.ts src/features/portal-api/principal.ts src/features/portal-api/principal.test.ts
git commit -m "feat: authenticate portal MCP users with Entra"
```

### Task 4: Extract template-app creation into a shared actor-aware service

**Files:**
- Create: `src/features/app-requests/create-generated-app.ts`
- Create: `src/features/app-requests/create-generated-app.test.ts`
- Modify: `src/app/create/actions.ts`
- Modify: `src/app/create/actions.test.ts`

**Interfaces:**
- Consumes: `CreateAppRequestInput`, actor user ID, source `portal-ui | codex-mcp`.
- Produces: `createGeneratedApp()` returning `CreateGeneratedAppResult`.

- [ ] **Step 1: Write the failing service test before moving code**

Cover successful creation, repository bootstrap failure, source-generation failure, template disappearance, audit source, notifications, and the invariant `publishStatus: "NOT_STARTED"`.

```ts
export type CreateGeneratedAppResult = {
  requestId: string;
  supportReference: string;
  generationStatus: "SUCCEEDED" | "FAILED";
  repositoryStatus: "READY" | "FAILED";
  repositoryUrl: string | null;
};

const result = await createGeneratedApp({
  actorUserId: "user-1",
  input: validInput,
  source: "codex-mcp",
}, dependencies);
expect(result.repositoryStatus).toBe("READY");
expect(prisma.appRequest.create).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ publishStatus: "NOT_STARTED" }),
}));
```

Run: `npm test -- src/features/app-requests/create-generated-app.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 2: Move orchestration without changing behavior**

Move the template upsert, app request create, source snapshot, GitHub bootstrap, audit, notification, and safe failure-state logic from `createAppAction` into:

```ts
export async function createGeneratedApp(
  request: {
    actorUserId: string;
    input: CreateAppRequestInput;
    source: "portal-ui" | "codex-mcp";
  },
  dependencies: CreateGeneratedAppDependencies = defaultDependencies,
): Promise<CreateGeneratedAppResult>;
```

Include `actorUserId`, `source`, request ID, and support reference in mutation audit details. Preserve E2E repository bootstrap only through the existing dependency.

- [ ] **Step 3: Make the server action a thin adapter**

`createAppAction` keeps `extractCreateAppInput(formData)`, calls `resolveCurrentUserId()`, invokes `createGeneratedApp({ actorUserId, input, source: "portal-ui" })`, and redirects to `/onboarding/${result.requestId}`. It contains no GitHub or Azure orchestration.

- [ ] **Step 4: Verify old and new behavior**

Run: `npm test -- src/features/app-requests/create-generated-app.test.ts src/app/create/actions.test.ts src/features/create-app/validation.test.ts`

Expected: PASS with the same redirect and failure semantics as before.

- [ ] **Step 5: Commit**

```bash
git add src/features/app-requests/create-generated-app.ts src/features/app-requests/create-generated-app.test.ts src/app/create/actions.ts src/app/create/actions.test.ts
git commit -m "refactor: share template app creation service"
```

### Task 5: Add authorized app and template read models

**Files:**
- Create: `src/features/app-requests/portal-summary.ts`
- Create: `src/features/app-requests/get-app-summary.ts`
- Create: `src/features/app-requests/get-app-summary.test.ts`
- Create: `src/features/app-requests/list-accessible-apps.ts`
- Create: `src/features/app-requests/list-accessible-apps.test.ts`
- Create: `src/features/templates/portal-api.ts`
- Create: `src/features/templates/portal-api.test.ts`

**Interfaces:**
- Consumes: template catalog, `appAccessWhere`, `appListWhereForUser`, actor-specific repository access, publish eligibility.
- Produces: `PortalTemplateSummary`, `PortalAppSummary`, `PortalPublishAttemptSummary`, and allowed-next-action values.

- [ ] **Step 1: Write failing template serialization tests**

Require current active templates only, fixed hosting target, explicit database modes/options, audience capabilities, and no source-template paths.

```ts
const summaries = listPortalTemplateSummaries();
expect(summaries.find((item) => item.slug === "web-app")).toMatchObject({
  hostingTarget: "Azure App Service",
  database: { mode: "optional", options: ["postgresql", "none"] },
  audience: { cedarville: true, public: true },
});
expect(JSON.stringify(summaries)).not.toContain("sourceTemplateSlug");
```

- [ ] **Step 2: Define the stable output types**

`PortalAppSummary` includes `id`, `appName`, template slug/name, `sourceOfTruth`, generation/repository/publishing-setup/publish statuses, actor repository-access status/note, repository URL/default branch, support reference, latest attempt, live URL, and:

```ts
export type PortalNextAction =
  | "request_github_access"
  | "publish_app_to_azure"
  | "get_publish_status"
  | "repair_publishing_setup"
  | "retry_publish"
  | "open_portal_for_advanced_management";
```

- [ ] **Step 3: Write failing access-isolation tests**

Test owner, accepted collaborator, admin, missing app, and foreign app. Missing and foreign both throw `PortalApiError("NOT_FOUND", "App not found.")`. Confirm repository access is resolved with the current actor's GitHub username, never the owner's username.

- [ ] **Step 4: Implement reads and next actions**

Implement:

```ts
export function listPortalTemplateSummaries(): PortalTemplateSummary[];
export async function getAccessibleAppSummary(actor: PortalActor, requestId: string): Promise<PortalAppSummary>;
export async function listAccessibleAppSummaries(actor: PortalActor): Promise<PortalAppSummary[]>;
export async function getAccessiblePublishAttemptSummary(actor: PortalActor, attemptId: string): Promise<PortalPublishAttemptSummary>;
```

Use the existing access predicates. Include imported/local records in `list_my_apps` but give excluded source types only `open_portal_for_advanced_management`. Return safe workflow/live links, never setup-check metadata or secret-bearing settings.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- src/features/templates/portal-api.test.ts src/features/app-requests/get-app-summary.test.ts src/features/app-requests/list-accessible-apps.test.ts`

Expected: PASS.

```bash
git add src/features/templates/portal-api.ts src/features/templates/portal-api.test.ts src/features/app-requests/portal-summary.ts src/features/app-requests/get-app-summary.ts src/features/app-requests/get-app-summary.test.ts src/features/app-requests/list-accessible-apps.ts src/features/app-requests/list-accessible-apps.test.ts
git commit -m "feat: add portal app API read models"
```

### Task 6: Extract actor-specific GitHub access into a shared service

**Files:**
- Create: `src/features/repositories/grant-repository-access.ts`
- Create: `src/features/repositories/grant-repository-access.test.ts`
- Modify: `src/features/repositories/actions.ts`
- Modify: `src/features/repositories/actions.test.ts`

**Interfaces:**
- Consumes: actor ID, request ID, GitHub username, portal access predicate, GitHub App grant helper.
- Produces: `grantRepositoryAccessForActor()` and `RepositoryAccessResult`.

- [ ] **Step 1: Write failing service tests**

Test owner/collaborator/admin access, quiet foreign denial, repository-not-ready conflict, username validation, invited/granted/failed provider outcomes, actor profile update, actor-specific audit persistence, and access revalidation before the GitHub call.

```ts
export type RepositoryAccessResult = {
  status: "INVITED" | "GRANTED" | "FAILED";
  note: string;
  githubUsername: string;
};
```

Run: `npm test -- src/features/repositories/grant-repository-access.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 2: Move the access logic**

Implement:

```ts
export async function grantRepositoryAccessForActor(input: {
  requestId: string;
  actorUserId: string;
  githubUsername: string;
  source: "portal-ui" | "codex-mcp";
}, dependencies = defaultDependencies): Promise<RepositoryAccessResult>;
```

Use `appAccessWhere` and `userHasAdminRole` immediately before `grantManagedRepositoryAccess`. Keep provider failure as the existing safe `FAILED` result. Persist `source`, actor, username, support reference, and result. Remove the accidental duplicate `githubUsername` property if it is still present in the existing call.

- [ ] **Step 3: Make the server action a thin adapter**

Parse `FormData`, resolve the browser actor, call the shared service with `source: "portal-ui"`, and preserve the current revalidation paths.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/repositories/grant-repository-access.test.ts src/features/repositories/actions.test.ts src/features/repositories/actor-access.test.ts src/features/repositories/access.test.ts`

Expected: PASS.

```bash
git add src/features/repositories/grant-repository-access.ts src/features/repositories/grant-repository-access.test.ts src/features/repositories/actions.ts src/features/repositories/actions.test.ts
git commit -m "refactor: share managed repository access service"
```

### Task 7: Extract publish, retry, and repair application services

**Files:**
- Create: `src/features/publishing/queue-publish.ts`
- Create: `src/features/publishing/queue-publish.test.ts`
- Create: `src/features/publishing/retry-publish.ts`
- Create: `src/features/publishing/retry-publish.test.ts`
- Create: `src/features/publishing/setup/repair-publishing-setup.ts`
- Create: `src/features/publishing/setup/repair-publishing-setup.test.ts`
- Modify: `src/features/publishing/actions.ts`
- Modify: `src/features/publishing/actions.test.ts`
- Modify: `src/features/publishing/setup/actions.ts`
- Modify: `src/features/publishing/setup/actions.test.ts`

**Interfaces:**
- Consumes: actor ID, access predicate, current eligibility functions, `runPublishAttempt`, publishing setup service.
- Produces: `queuePublishForActor()`, `retryPublishForActor()`, `repairPublishingSetupForActor()`.

- [ ] **Step 1: Write failing queue-service tests**

Port the meaningful service-level cases from `actions.test.ts`: owner/collaborator/admin access, quiet foreign denial, generated app before setup check, republish after success, imported readiness preserved for UI, atomic stale-state rejection, audit source, and worker start after commit.

```ts
export type QueuedPublishResult = { attemptId: string; status: "QUEUED" };
export async function queuePublishForActor(input: {
  requestId: string;
  actorUserId: string;
  source: "portal-ui" | "codex-mcp";
}): Promise<QueuedPublishResult>;
```

Run: `npm test -- src/features/publishing/queue-publish.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 2: Move initial/republish queueing and worker start**

Keep the eligibility messages and transaction predicates exactly aligned with current behavior. Recheck actor access before the transaction. Export a single `startPublishWorker(attemptId)` used by queue and retry; never await the long deployment from the request.

- [ ] **Step 3: Write and implement retry service tests**

Define:

```ts
export async function retryPublishForActor(input: {
  requestId: string;
  actorUserId: string;
  source: "portal-ui" | "codex-mcp";
}): Promise<QueuedPublishResult>;
```

Require `publishStatus: FAILED`, preserve current allowed setup statuses, atomically claim, create one attempt, audit, and start the worker.

- [ ] **Step 4: Write and implement repair service tests**

Define:

```ts
export async function repairPublishingSetupForActor(input: {
  requestId: string;
  actorUserId: string;
  source: "portal-ui" | "codex-mcp";
}): Promise<{ status: PublishingSetupStatus }>;
```

Move authorization, eligibility, atomic claim, safe failure-state persistence, blocked notification, and stale-attempt behavior from the action. Recheck actor access before the provider service. It must never dispatch a deployment or delete resources.

- [ ] **Step 5: Reduce server actions to adapters**

Keep `publishToAzureAction`, `retryPublishAction`, and `repairPublishingSetupAction` names/signatures because pages import them. Each resolves the current user, calls its shared service with `source: "portal-ui"`, then performs only view revalidation.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- src/features/publishing/queue-publish.test.ts src/features/publishing/retry-publish.test.ts src/features/publishing/setup/repair-publishing-setup.test.ts src/features/publishing/actions.test.ts src/features/publishing/setup/actions.test.ts src/features/publishing/eligibility.test.ts`

Expected: PASS. If the user's pre-existing eligibility changes make the final file fail, report the overlap rather than reverting or staging those files.

```bash
git add src/features/publishing/queue-publish.ts src/features/publishing/queue-publish.test.ts src/features/publishing/retry-publish.ts src/features/publishing/retry-publish.test.ts src/features/publishing/setup/repair-publishing-setup.ts src/features/publishing/setup/repair-publishing-setup.test.ts src/features/publishing/actions.ts src/features/publishing/actions.test.ts src/features/publishing/setup/actions.ts src/features/publishing/setup/actions.test.ts
git commit -m "refactor: share portal publishing services"
```

### Task 8: Build the authenticated MCP server and nine tools

**Files:**
- Create: `src/features/portal-mcp/result.ts`
- Create: `src/features/portal-mcp/result.test.ts`
- Create: `src/features/portal-mcp/server.ts`
- Create: `src/features/portal-mcp/server.test.ts`
- Create: `src/features/portal-mcp/tools/list-app-templates.ts`
- Create: `src/features/portal-mcp/tools/list-my-apps.ts`
- Create: `src/features/portal-mcp/tools/create-app.ts`
- Create: `src/features/portal-mcp/tools/get-app.ts`
- Create: `src/features/portal-mcp/tools/request-github-access.ts`
- Create: `src/features/portal-mcp/tools/publish-app-to-azure.ts`
- Create: `src/features/portal-mcp/tools/get-publish-status.ts`
- Create: `src/features/portal-mcp/tools/repair-publishing-setup.ts`
- Create: `src/features/portal-mcp/tools/retry-publish.ts`
- Create: `src/app/api/mcp/route.ts`
- Create: `src/app/api/mcp/route.test.ts`
- Create: `src/app/.well-known/oauth-protected-resource/route.ts`
- Create: `src/app/.well-known/oauth-protected-resource/route.test.ts`

**Interfaces:**
- Consumes: Tasks 2-7 services and `PortalActor`.
- Produces: stateless `/api/mcp`, protected-resource metadata, exact nine-tool contract.

- [ ] **Step 1: Write failing safe-result tests**

`portalToolSuccess(data, text)` returns both `structuredContent` and short text. `portalToolFailure(error)` returns `isError: true` with only the safe code/message/retry value. Assert serialized results never contain test tokens, secrets, stack traces, or raw provider messages.

- [ ] **Step 2: Write failing server contract tests**

Initialize a server with a fake actor and injected service handlers. Assert the exact tool list:

```ts
expect(toolNames).toEqual([
  "list_app_templates", "list_my_apps", "create_app", "get_app",
  "request_github_access", "publish_app_to_azure", "get_publish_status",
  "repair_publishing_setup", "retry_publish",
]);
```

Assert read tools have `{readOnlyHint:true, destructiveHint:false, openWorldHint:false}`. Mutation tools have `{readOnlyHint:false, destructiveHint:false, openWorldHint:true}`. No deletion tool exists.

- [ ] **Step 3: Implement focused tool adapters**

Each file exports `registerXTool(server, context)`. Zod schemas use strict objects and stable UUID validation. `create_app` calls `executeIdempotentMutation` with operation/rate action `create_app`, then `createGeneratedApp({source:"codex-mcp"})`. The four other mutations use their matching operation names and policies. Read tools call `claimPortalRateLimit(..., "read")`.

`create_app` schema includes:

```ts
{
  idempotencyKey: z.string().uuid(),
  templateSlug: z.string().min(1),
  appName: z.string(),
  description: z.string(),
  databaseProvider: z.enum(["none", "postgresql"]),
  entraLogin: z.boolean(),
  publicAcknowledgement: z.literal(true).optional(),
}
```

The handler reconstructs `hostingTarget` from the selected catalog template instead of trusting the caller. It reuses `createAppSchema(... requirePublicAcknowledgement:true)`.

- [ ] **Step 4: Enforce plugin scope in mutation adapters**

Before GitHub access, publish, repair, or retry, call `getAccessibleAppSummary` and require `sourceOfTruth === "PORTAL_MANAGED_REPO"`. For imported/local apps return `ACTION_REQUIRED` with “Open the Cedarville App Portal for this app workflow.” Shared UI services retain imported-app support.

- [ ] **Step 5: Implement the MCP server**

Create `createPortalMcpHandler(actor, dependencies?)` with `mcp-handler` 2:

```ts
return createMcpHandler(
  (server) => registerPortalTools(server, { actor, ...dependencies }),
  {
    serverInfo: { name: "cedarville-app-portal", version: "1.0.0" },
    instructions: "List current templates before app creation. Creation never publishes. Publish, repair, and retry require a separate explicit user request.",
  },
);
```

Keep the handler stateless and do not enable deprecated SSE/Redis configuration.

- [ ] **Step 6: Write and implement route tests**

Test missing/invalid auth returns `401` with `WWW-Authenticate` resource metadata; disabled MCP returns quiet `404`; valid auth reaches initialization; OPTIONS/metadata responses use CORS and `Cache-Control: no-store`; browser session and E2E bypass alone fail.

The route pattern is:

```ts
async function handle(request: Request) {
  const { actor } = await authenticatePortalApiRequest(request);
  return createPortalMcpHandler(actor)(request);
}
export { handle as GET, handle as POST, handle as DELETE };
```

Use `protectedResourceHandler` and `metadataCorsOptionsRequestHandler` from `mcp-handler` for `/.well-known/oauth-protected-resource`, supplying exact resource URL, issuer, and scope from validated config.

- [ ] **Step 7: Verify every tool and commit**

Run: `npm test -- src/features/portal-mcp src/app/api/mcp/route.test.ts src/app/.well-known/oauth-protected-resource/route.test.ts`

Expected: PASS with exact schemas, annotations, auth challenges, and safe results.

```bash
git add src/features/portal-mcp src/app/api/mcp/route.ts src/app/api/mcp/route.test.ts src/app/.well-known/oauth-protected-resource/route.ts src/app/.well-known/oauth-protected-resource/route.test.ts
git commit -m "feat: expose Cedarville portal MCP tools"
```

### Task 9: Create and pressure-test the workspace plugin skill

**Files:**
- Create: `plugins/cedarville-app-portal/.codex-plugin/plugin.json`
- Create: `plugins/cedarville-app-portal/skills/cedarville-app-portal-workspace/SKILL.md`
- Create: `plugins/cedarville-app-portal/skills/cedarville-app-portal-workspace/agents/openai.yaml`
- Create: `.agents/plugins/marketplace.json`
- Create: `scripts/plugins/finalize-portal-plugin.mjs`
- Create: `scripts/plugins/finalize-portal-plugin.test.ts`
- Create: `src/features/portal-mcp/plugin-package.test.ts`

**Interfaces:**
- Consumes: registered MCP app ID only at deployment finalization.
- Produces: installable skills-only skeleton now; finalized MCP-backed plugin only after the real app ID is supplied.

- [ ] **Step 1: Run baseline pressure scenarios before writing the skill**

Using the writing-skills workflow and isolated temporary directories, dispatch independent evaluators without the new skill for: “create and publish immediately,” “customize first,” duplicate create pressure, public app without acknowledgement, repair without approval, foreign app, and existing GitHub import. Record the exact unsafe shortcuts or missing decisions in implementation notes; do not place evaluator artifacts in the repository.

- [ ] **Step 2: Write failing package-contract tests**

Require plugin name/version/skills path, marketplace local source `./plugins/cedarville-app-portal`, installation `AVAILABLE`, authentication `ON_INSTALL`, distinct workspace-skill name, all nine tool names, explicit creation/publish separation, public acknowledgement, secure Git guidance, bounded polling, exclusions, and absence of `.app.json` before registration.

```ts
expect(skill).toContain("Creation never publishes");
expect(skill).toContain("separate explicit request");
expect(skill).toContain("request_github_access");
expect(existsSync("plugins/cedarville-app-portal/.app.json")).toBe(false);
```

Run: `npm test -- src/features/portal-mcp/plugin-package.test.ts`

Expected: FAIL because the package does not exist.

- [ ] **Step 3: Scaffold the plugin and write the minimal skill**

Use the plugin-creator and skill-creator workflows. The plugin name is `cedarville-app-portal`, version `1.0.0`, and its `skills` field is `./skills/`. The skill name is `cedarville-app-portal-workspace` so it cannot be confused with the generated app-local `cu-app-portal` skill.

The skill must teach: list current templates; ask one allowed question at a time; summarize and approve creation; creation stops at GitHub; request access only for customization; use secure local Git; separately approve publish/repair/retry; poll status with bounded waits; distinguish verified/partial/blocked; route excluded imports, collaborator management, env vars, push-to-deploy, and deletion to the UI.

Generate `agents/openai.yaml` with `display_name: Cedarville App Portal`, `short_description: Create and publish Cedarville-managed apps from Codex.`, and `default_prompt: Create a new Cedarville app from an approved portal template.` Keep implicit invocation enabled.

- [ ] **Step 4: Add the marketplace**

Create `.agents/plugins/marketplace.json` with marketplace name `cedarville-university-plugins`, display name `Cedarville University`, category `Developer Tools`, local plugin path, `AVAILABLE`, and `ON_INSTALL`.

- [ ] **Step 5: Add a safe finalization script**

`finalize-portal-plugin.mjs --app-id <value>` must reject missing values and anything not matching `^plugin_asdk_app_[A-Za-z0-9]+$`. On a valid real ID it writes `.app.json` with required app key `cedarville-app-portal` and updates `plugin.json` `apps` to `./.app.json`. The test runs only in a temporary copied plugin folder so no fake `.app.json` enters the repository.

- [ ] **Step 6: Run post-skill pressure scenarios**

Repeat every baseline scenario with the skill supplied. Require correct tool selection, no create-and-publish collapse, no automatic repair/retry, quiet foreign handling, and UI routing for exclusions. Tighten only instructions supported by observed failures.

- [ ] **Step 7: Validate and commit**

Run the skill creator's `quick_validate.py` on the skill folder.

Run: `npm test -- src/features/portal-mcp/plugin-package.test.ts scripts/plugins/finalize-portal-plugin.test.ts`

Expected: PASS and `test ! -e plugins/cedarville-app-portal/.app.json` succeeds.

```bash
git add plugins/cedarville-app-portal .agents/plugins/marketplace.json scripts/plugins/finalize-portal-plugin.mjs scripts/plugins/finalize-portal-plugin.test.ts src/features/portal-mcp/plugin-package.test.ts
git commit -m "feat: package Cedarville portal workspace plugin"
```

### Task 10: Document setup, operations, rollout, and evidence boundaries

**Files:**
- Modify: `README.md`
- Modify: `docs/portal/setup.md`
- Modify: `docs/portal/technical-operations.md`
- Create: `docs/portal/codex-workspace-plugin.md`
- Create: `src/features/portal-mcp/docs.test.ts`

**Interfaces:**
- Consumes: exact env variables, endpoints, tool names, marketplace path, rate limits, admin gates.
- Produces: operator-ready deployment and rollback instructions without secrets.

- [ ] **Step 1: Write failing documentation-contract tests**

Assert docs contain all MCP env names, `/api/mcp`, protected metadata, delegated scope, exact nine tools, exact limits, Entra PKCE/resource/audience validation gate, marketplace import path, role-limited pilot, `.app.json` finalization command, rollback, and explicit verified/partial language. Assert docs do not contain `plugin_asdk_app_example`, real-looking bearer tokens, client secrets, or a claim that production registration is already complete.

- [ ] **Step 2: Update setup and README**

Document disabled-by-default local behavior and the exact configuration fields from Task 3. Explain that Auth.js browser credentials do not automatically configure the delegated MCP resource.

- [ ] **Step 3: Add the operator runbook**

`codex-workspace-plugin.md` must give the sequential handoff:

1. Deploy code with MCP disabled.
2. Register/expose the Entra delegated API scope and grant consent.
3. Register the exact OpenAI redirect URI.
4. Enable MCP config and verify protected metadata.
5. Test real Cedarville OAuth through developer mode.
6. Register the MCP app and capture the real `plugin_asdk_app...` ID.
7. Run `node scripts/plugins/finalize-portal-plugin.mjs --app-id "$PORTAL_PLUGIN_APP_ID"` with a task-specific shell variable.
8. Validate and commit the finalized package.
9. Import/sync the GitHub marketplace as a workspace admin.
10. Assign a restricted pilot role and execute the disposable-app smoke test.
11. Expand only after evidence review.

Rollback disables the workspace plugin and `PORTAL_MCP_ENABLED`; it never deletes app, GitHub, or Azure resources.

- [ ] **Step 4: Verify and commit docs**

Run: `npm test -- src/features/portal-mcp/docs.test.ts`

Expected: PASS.

```bash
git add README.md docs/portal/setup.md docs/portal/technical-operations.md docs/portal/codex-workspace-plugin.md src/features/portal-mcp/docs.test.ts
git commit -m "docs: add Codex portal plugin operations"
```

### Task 11: Run local verification and prepare the administrator handoff

**Files:**
- Modify only if a verified defect is found: files already introduced by Tasks 1-10.
- Do not create: `plugins/cedarville-app-portal/.app.json` without the real identifier.

**Interfaces:**
- Consumes: completed local implementation.
- Produces: verified local evidence and an explicit list of unverified administrator gates.

- [ ] **Step 1: Run focused suites**

Run:

```bash
npm test -- src/features/portal-api src/features/portal-mcp src/features/app-requests/create-generated-app.test.ts src/features/app-requests/get-app-summary.test.ts src/features/app-requests/list-accessible-apps.test.ts src/features/repositories/grant-repository-access.test.ts src/features/publishing/queue-publish.test.ts src/features/publishing/retry-publish.test.ts src/features/publishing/setup/repair-publishing-setup.test.ts src/app/create/actions.test.ts src/features/repositories/actions.test.ts src/features/publishing/actions.test.ts src/features/publishing/setup/actions.test.ts
```

Expected: PASS.

- [ ] **Step 2: Validate Prisma migration against local PostgreSQL**

Run: `npm run db:up`

Run: `npm run prisma:migrate:deploy`

Run: `npm run prisma:generate`

Expected: migration applies once, re-running deploy reports no pending migration, client generation succeeds.

- [ ] **Step 3: Run full regression and build**

Run: `npm test`

Run: `npm run build`

Expected: PASS. Do not repair unrelated dirty-worktree failures without approval; report them precisely.

- [ ] **Step 4: Inspect protocol behavior locally**

Start the portal with test-only signed-token configuration, connect MCP Inspector to `http://localhost:3000/api/mcp`, initialize, list all nine tools, call each read tool, call mutations against mocked/test providers, and verify invalid inputs, quiet foreign apps, auth challenges, annotations, structured output, and no secrets.

- [ ] **Step 5: Prove the no-UI constraint and repository cleanliness**

Run:

```bash
git diff --check
git status --short
git diff --name-only HEAD~10..HEAD -- src/app | rg -v '^src/app/(api/mcp|\.well-known/oauth-protected-resource|create/actions)' || true
```

Expected: no portal page/component/UI file from this feature. Confirm the four pre-existing user-modified files remain unstaged and unaltered by feature commits.

- [ ] **Step 6: Prepare the handoff report**

Report as locally verified: source tests, build, migration, package/skill validation, and Inspector behavior actually run. Report as not yet verified unless completed with administrators: Entra registration/consent, real OpenAI OAuth, real `.app.json`, workspace publication, live GitHub access, live Azure deployment, pilot cleanup.

- [ ] **Step 7: Commit only verified corrective changes, if any**

If verification required changes, stage only those exact files and commit:

```bash
git commit -m "test: verify Codex portal workspace plugin"
```

If no files changed, do not create an empty commit.

### Task 12: Complete administrator-owned production gates

**Files:**
- Create after exact ID is supplied: `plugins/cedarville-app-portal/.app.json`
- Modify after exact ID is supplied: `plugins/cedarville-app-portal/.codex-plugin/plugin.json`

**Interfaces:**
- Consumes: administrator-configured Entra registration and the real registered MCP app ID.
- Produces: finalized workspace plugin and real pilot evidence.

- [ ] **Step 1: Verify Entra and OpenAI OAuth end to end**

An Entra administrator configures the dedicated audience/scope, admin consent, and exact redirect URI. In ChatGPT developer mode, sign in with a Cedarville pilot account and verify metadata discovery, PKCE S256, `resource`, audience, delegated `scp`, `tid`, `oid`, email domain, expiry, and successful `/api/mcp` initialization. Stop on any mismatch; do not weaken validation.

- [ ] **Step 2: Finalize with the real app ID**

Receive the exact issued value through the administrator handoff, set the task-specific `PORTAL_PLUGIN_APP_ID` variable in the operator's secure shell without recording it in the plan or logs, confirm it starts with `plugin_asdk_app_`, and run:

```bash
node scripts/plugins/finalize-portal-plugin.mjs --app-id "$PORTAL_PLUGIN_APP_ID"
```

Confirm `.app.json` contains the actual ID and no secret.

- [ ] **Step 3: Validate and commit the final connection mapping**

Run package tests and skill validation again, then:

```bash
git add plugins/cedarville-app-portal/.app.json plugins/cedarville-app-portal/.codex-plugin/plugin.json
git commit -m "chore: connect Cedarville portal MCP app"
```

- [ ] **Step 4: Publish to the Cedarville workspace pilot**

A workspace admin imports/syncs `.agents/plugins/marketplace.json`, installs the plugin only for the approved pilot role, and confirms authentication happens on install.

- [ ] **Step 5: Run the disposable live-app smoke test**

With one pilot user: list templates; create one private template app; verify its portal record and managed GitHub repository; request GitHub access; explicitly request Azure publish in a separate turn; poll to success; open the live URL; verify audit source/actor/idempotency; record exact app request, repository, Azure resource, workflow run, and support reference.

- [ ] **Step 6: Request separate cleanup approval**

Do not delete the disposable portal record, GitHub repository, or Azure resources under this implementation authorization. Present the exact recorded targets and request explicit scoped cleanup approval.

- [ ] **Step 7: Record rollout status accurately**

Only after Steps 1-5 succeed may the handoff say production OAuth, workspace installation, managed GitHub creation, and Azure publishing are verified. Otherwise identify the exact completed gate and remaining administrator action.
