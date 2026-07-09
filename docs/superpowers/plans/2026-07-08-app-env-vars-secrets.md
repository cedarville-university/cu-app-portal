# App Environment Variables and Secrets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let app owners and collaborators manage per-app environment variables from the app details screen, with secret values stored in a per-app Azure Key Vault and surfaced to the running app via Key Vault references.

**Architecture:** The portal DB (`AppEnvironmentVariable`) is the source of truth for which vars exist; Key Vault holds secret values. Server actions apply changes to Azure immediately (read-merge-write of app settings so portal-reserved keys survive), and `provisionInfrastructure` merges user vars at publish so republish never wipes them. Each published web app gets a system-assigned managed identity with vault-scoped read access to its own Key Vault.

**Tech Stack:** Next.js 15 server actions, Prisma 6/PostgreSQL, hand-rolled Azure ARM + Key Vault REST clients (fetch + `DefaultAzureCredential`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-08-app-env-vars-secrets-design.md`

## Global Constraints

- Key format: `^[A-Za-z_][A-Za-z0-9_]*$`, max 128 chars; value max 4096 chars; empty value allowed only for non-secrets.
- Reserved keys (exact, case-insensitive): `DATABASE_URL`, `AUTH_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER`, `NODE_ENV`, `PORT`. Reserved prefixes (case-insensitive): `WEBSITE_`, `SCM_`, `ENABLE_ORYX`.
- Secret values must never be written to the portal DB or audit log — DB `value` column is null for secrets; audit details carry only `key` and `isSecret`.
- Vault name: `kv-{slug}-{shortRequestId}`, max 24 chars. Vault secret name: env key with `_` → `-`. Key uniqueness per app is case-insensitive with `_`/`-` treated as equivalent.
- Key Vault Secrets User role definition ID: `4633458b-17de-408a-b874-0445c86b69e6`.
- ARM api-versions: vaults `2023-07-01`, role assignments `2022-04-01`, sites `2023-12-01`. Key Vault data plane: `7.4`.
- Azure-first ordering: DB writes happen only after the Azure calls succeed.
- All code TypeScript with the repo's existing style (feature modules under `src/features/`, DI via `deps` objects, fetch-mock Vitest tests).
- Run tests with `npm test -- <path>` (vitest run). Full gate: `npm test` and `npm run build`.
- Commit after every task; commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Prisma schema — `AppEnvironmentVariable` + vault fields

**Files:**
- Modify: `prisma/schema.prisma` (AppRequest model at lines 41-91; add new model after `AppAccess`)
- Create: `prisma/migrations/<timestamp>_add_app_environment_variables/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma model `AppEnvironmentVariable` with fields `id`, `appRequestId`, `key`, `isSecret`, `value: String?`, `createdAt`, `updatedAt`, compound unique `appRequestId_key`; `AppRequest.azureKeyVaultName: String?`, `AppRequest.azureKeyVaultUri: String?`, relation `AppRequest.environmentVariables`.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, inside `model AppRequest`, after the line `azureDefaultHostName  String?` add:

```prisma
  azureKeyVaultName     String?
  azureKeyVaultUri      String?
```

and in the relations block at the bottom of `AppRequest` (after `notificationDeliveries NotificationDelivery[]`) add:

```prisma
  environmentVariables AppEnvironmentVariable[]
```

After the `AppAccess` model, add:

```prisma
model AppEnvironmentVariable {
  id           String     @id @default(cuid())
  appRequestId String
  key          String
  isSecret     Boolean
  value        String?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  appRequest   AppRequest @relation(fields: [appRequestId], references: [id], onDelete: Cascade)

  @@unique([appRequestId, key])
}
```

- [ ] **Step 2: Create the migration**

Run:
```bash
npm run db:up
npx prisma migrate dev --name add_app_environment_variables
```
Expected: migration created under `prisma/migrations/`, `prisma generate` runs, exit 0. (Local Postgres must be up; `db:up` is idempotent.)

- [ ] **Step 3: Verify existing tests still pass**

Run: `npm test`
Expected: PASS (no behavior changed).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add AppEnvironmentVariable model and app key vault fields

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Naming — vault name and vault secret name

**Files:**
- Modify: `src/features/publishing/azure/naming.ts`
- Test: `src/features/publishing/azure/naming.test.ts`

**Interfaces:**
- Produces: `buildPublishTargetNames(...).keyVaultName: string`; `toKeyVaultSecretName(key: string): string`.

- [ ] **Step 1: Write the failing tests**

Append to the existing describe block in `naming.test.ts` (match the file's existing import of `buildPublishTargetNames`; add `toKeyVaultSecretName` to that import):

```ts
it("builds a key vault name within the azure 24-character limit", () => {
  const names = buildPublishTargetNames({
    requestId: "clx9abc123zzzzzzzzzz",
    appName: "Campus Dashboard",
  });

  expect(names.keyVaultName).toBe("kv-campus-dashb-clx9abc1");
  expect(names.keyVaultName.length).toBeLessThanOrEqual(24);
  expect(names.keyVaultName).toMatch(/^kv-[a-z0-9][a-z0-9-]*[a-z0-9]$/);
});

it("maps env var keys to key vault secret names", () => {
  expect(toKeyVaultSecretName("API_KEY")).toBe("API-KEY");
  expect(toKeyVaultSecretName("SIMPLE")).toBe("SIMPLE");
});
```

Note: verify the expected `keyVaultName` by hand — `buildNameWithSuffix({ prefix: "kv-", slug: "campus-dashboard", suffix: "clx9abc1", maxLength: 24 })` leaves `24 - (3 + 1 + 8) = 12` chars of slug: `campus-dashb`, giving `kv-campus-dashb-clx9abc1` (exactly 24 chars). If the actual output differs when you run it, inspect `buildNameWithSuffix` and fix the expectation to the real deterministic value — the invariants that matter are the `kv-` prefix, the suffix, and ≤24 chars.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/features/publishing/azure/naming.test.ts`
Expected: FAIL — `keyVaultName` undefined, `toKeyVaultSecretName` not exported.

- [ ] **Step 3: Implement**

In `naming.ts`, add `keyVaultName: string;` to the `PublishTargetNames` type, and inside `buildPublishTargetNames` add after `federatedCredentialName`:

```ts
  const keyVaultName = buildNameWithSuffix({
    prefix: "kv-",
    slug,
    suffix: shortRequestId,
    maxLength: 24,
  });
```

Include `keyVaultName,` in the returned object. Then add at the bottom of the file:

```ts
export function toKeyVaultSecretName(key: string) {
  return key.replaceAll("_", "-");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/publishing/azure/naming.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/publishing/azure/naming.ts src/features/publishing/azure/naming.test.ts
git commit -m "feat: add key vault naming for published apps

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Env var validation module

**Files:**
- Create: `src/features/env-vars/validation.ts`
- Test: `src/features/env-vars/validation.test.ts`

**Interfaces:**
- Produces:
  - `type EnvVarValidation = { ok: true } | { ok: false; error: string }`
  - `validateEnvVarKey(key: string): EnvVarValidation`
  - `validateEnvVarValue(value: string, isSecret: boolean): EnvVarValidation`
  - `normalizeEnvVarKey(key: string): string` (lowercase, `_` → `-`; used for case-insensitive/`_`-`-`-equivalent uniqueness)
  - `RESERVED_ENV_KEYS: readonly string[]`, `RESERVED_ENV_KEY_PREFIXES: readonly string[]`

- [ ] **Step 1: Write the failing tests**

Create `src/features/env-vars/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  normalizeEnvVarKey,
  validateEnvVarKey,
  validateEnvVarValue,
} from "./validation";

describe("validateEnvVarKey", () => {
  it("accepts conventional env var keys", () => {
    expect(validateEnvVarKey("API_KEY")).toEqual({ ok: true });
    expect(validateEnvVarKey("_private")).toEqual({ ok: true });
    expect(validateEnvVarKey("FEATURE_FLAG_2")).toEqual({ ok: true });
  });

  it("rejects malformed keys", () => {
    for (const key of ["", "2LEADING_DIGIT", "HAS-HYPHEN", "HAS SPACE", "HAS.DOT"]) {
      expect(validateEnvVarKey(key).ok).toBe(false);
    }
  });

  it("rejects keys longer than 128 characters", () => {
    expect(validateEnvVarKey(`K${"A".repeat(128)}`).ok).toBe(false);
  });

  it("rejects reserved keys case-insensitively", () => {
    for (const key of ["DATABASE_URL", "database_url", "Auth_Secret", "PORT", "NODE_ENV", "NEXTAUTH_URL", "AUTH_MICROSOFT_ENTRA_ID_SECRET"]) {
      const result = validateEnvVarKey(key);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("reserved");
      }
    }
  });

  it("rejects reserved prefixes case-insensitively", () => {
    for (const key of ["WEBSITE_RUN_FROM_PACKAGE", "website_custom", "SCM_ANYTHING", "ENABLE_ORYX_BUILD"]) {
      expect(validateEnvVarKey(key).ok).toBe(false);
    }
  });
});

describe("validateEnvVarValue", () => {
  it("allows empty values for non-secrets but not secrets", () => {
    expect(validateEnvVarValue("", false)).toEqual({ ok: true });
    expect(validateEnvVarValue("", true).ok).toBe(false);
  });

  it("rejects values longer than 4096 characters", () => {
    expect(validateEnvVarValue("v".repeat(4097), false).ok).toBe(false);
    expect(validateEnvVarValue("v".repeat(4096), false)).toEqual({ ok: true });
  });
});

describe("normalizeEnvVarKey", () => {
  it("treats case and underscore/hyphen as equivalent", () => {
    expect(normalizeEnvVarKey("API_KEY")).toBe(normalizeEnvVarKey("api_key"));
    expect(normalizeEnvVarKey("API_KEY")).toBe("api-key");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/features/env-vars/validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/env-vars/validation.ts`:

```ts
export type EnvVarValidation = { ok: true } | { ok: false; error: string };

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_KEY_LENGTH = 128;
const MAX_VALUE_LENGTH = 4096;

export const RESERVED_ENV_KEYS = [
  "DATABASE_URL",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "AUTH_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ID",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
  "NODE_ENV",
  "PORT",
] as const;

export const RESERVED_ENV_KEY_PREFIXES = [
  "WEBSITE_",
  "SCM_",
  "ENABLE_ORYX",
] as const;

export function validateEnvVarKey(key: string): EnvVarValidation {
  if (!key || key.length > MAX_KEY_LENGTH || !ENV_KEY_PATTERN.test(key)) {
    return {
      ok: false,
      error:
        "Variable names must start with a letter or underscore, use only letters, digits, and underscores, and be at most 128 characters.",
    };
  }

  const upperKey = key.toUpperCase();

  if (RESERVED_ENV_KEYS.some((reserved) => reserved === upperKey)) {
    return {
      ok: false,
      error: `"${key}" is reserved and managed by the portal.`,
    };
  }

  if (RESERVED_ENV_KEY_PREFIXES.some((prefix) => upperKey.startsWith(prefix))) {
    return {
      ok: false,
      error: `Variable names starting with a reserved Azure prefix are managed by the portal.`,
    };
  }

  return { ok: true };
}

export function validateEnvVarValue(
  value: string,
  isSecret: boolean,
): EnvVarValidation {
  if (isSecret && value.length === 0) {
    return { ok: false, error: "Secret values cannot be empty." };
  }

  if (value.length > MAX_VALUE_LENGTH) {
    return {
      ok: false,
      error: "Values must be at most 4096 characters.",
    };
  }

  return { ok: true };
}

export function normalizeEnvVarKey(key: string) {
  return key.toLowerCase().replaceAll("_", "-");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/env-vars/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/env-vars/validation.ts src/features/env-vars/validation.test.ts
git commit -m "feat: add env var key and value validation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: ARM client — Key Vault, role assignments, managed identity

**Files:**
- Modify: `src/features/publishing/azure/arm-client.ts`
- Test: `src/features/publishing/azure/arm-client.test.ts`

**Interfaces:**
- Produces (all on the object returned by `createAzureArmClient`):
  - `keyVaultId(resourceGroup: string, name: string): string`
  - `putKeyVault(input: { resourceGroup: string; name: string; location: string; tenantId: string; tags: Record<string, string> }): Promise<{ vaultUri: string }>` (vaultUri has no trailing slash)
  - `deleteKeyVault(input: { resourceGroup: string; name: string }): Promise<void>` (tolerates 404)
  - `putRoleAssignment(input: { scope: string; roleDefinitionId: string; principalId: string }): Promise<void>` (deterministic GUID name; 409 treated as success)
  - `ensureSystemAssignedIdentity(input: { resourceGroup: string; name: string }): Promise<{ principalId: string }>`
  - `putWebApp` now sends `identity: { type: "SystemAssigned" }` and its response type includes `identity?: { principalId?: string }`
  - Exported constant `KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID = "4633458b-17de-408a-b874-0445c86b69e6"`

- [ ] **Step 1: Update the existing putWebApp test**

In `arm-client.test.ts`, the first test ("creates or updates a web app…") asserts an exact `JSON.stringify` body. Update the expected body to include the identity block (it sits between `kind` and `tags` in the new implementation below):

```ts
        body: JSON.stringify({
          location: "eastus2",
          kind: "app,linux",
          identity: { type: "SystemAssigned" },
          tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
          properties: {
            serverFarmId:
              "/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/serverfarms/asp-cu-apps-published",
            httpsOnly: true,
            siteConfig: {
              linuxFxVersion: "NODE|24-lts",
              appCommandLine: "npm start",
            },
          },
        }),
```

- [ ] **Step 2: Write the failing tests**

Append to the describe block in `arm-client.test.ts`:

```ts
it("creates an rbac key vault and returns its uri", async () => {
  const fetchImpl = vi
    .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .mockResolvedValue(
      json({
        properties: { vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net/" },
      }),
    );
  const client = createAzureArmClient({
    subscriptionId: "sub",
    tokenProvider: async () => "token",
    fetchImpl,
  });

  const result = await client.putKeyVault({
    resourceGroup: "rg-cu-apps-published",
    name: "kv-campus-dashb-clx9abc1",
    location: "eastus2",
    tenantId: "tenant-id",
    tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
  });

  expect(result).toEqual({
    vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
  });
  expect(fetchImpl).toHaveBeenCalledWith(
    "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.KeyVault/vaults/kv-campus-dashb-clx9abc1?api-version=2023-07-01",
    expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({
        location: "eastus2",
        tags: { managedBy: "cu-app-portal", appRequestId: "request-123" },
        properties: {
          tenantId: "tenant-id",
          sku: { family: "A", name: "standard" },
          enableRbacAuthorization: true,
        },
      }),
    }),
  );
});

it("deletes a key vault and tolerates a missing vault", async () => {
  const fetchImpl = vi
    .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(text("not found", { status: 404 }));
  const client = createAzureArmClient({
    subscriptionId: "sub",
    tokenProvider: async () => "token",
    fetchImpl,
  });

  await client.deleteKeyVault({
    resourceGroup: "rg-cu-apps-published",
    name: "kv-campus-dashb-clx9abc1",
  });
  await client.deleteKeyVault({
    resourceGroup: "rg-cu-apps-published",
    name: "kv-missing",
  });

  expect(fetchImpl).toHaveBeenNthCalledWith(
    1,
    "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.KeyVault/vaults/kv-campus-dashb-clx9abc1?api-version=2023-07-01",
    expect.objectContaining({ method: "DELETE" }),
  );
});

it("creates a role assignment with a deterministic name and treats conflicts as success", async () => {
  const fetchImpl = vi
    .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .mockResolvedValueOnce(json({ id: "assignment-id" }))
    .mockResolvedValueOnce(text("RoleAssignmentExists", { status: 409 }));
  const client = createAzureArmClient({
    subscriptionId: "sub",
    tokenProvider: async () => "token",
    fetchImpl,
  });
  const scope = client.keyVaultId(
    "rg-cu-apps-published",
    "kv-campus-dashb-clx9abc1",
  );

  await client.putRoleAssignment({
    scope,
    roleDefinitionId: "4633458b-17de-408a-b874-0445c86b69e6",
    principalId: "principal-guid",
  });
  await client.putRoleAssignment({
    scope,
    roleDefinitionId: "4633458b-17de-408a-b874-0445c86b69e6",
    principalId: "principal-guid",
  });

  const firstUrl = fetchImpl.mock.calls[0][0] as string;
  const secondUrl = fetchImpl.mock.calls[1][0] as string;

  expect(firstUrl).toBe(secondUrl);
  expect(firstUrl).toContain(
    `https://management.azure.com${scope}/providers/Microsoft.Authorization/roleAssignments/`,
  );
  expect(firstUrl).toContain("api-version=2022-04-01");
  expect(firstUrl).toMatch(
    /roleAssignments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\?/,
  );
  expect(fetchImpl).toHaveBeenNthCalledWith(
    1,
    firstUrl,
    expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({
        properties: {
          roleDefinitionId:
            "/subscriptions/sub/providers/Microsoft.Authorization/roleDefinitions/4633458b-17de-408a-b874-0445c86b69e6",
          principalId: "principal-guid",
          principalType: "ServicePrincipal",
        },
      }),
    }),
  );
});

it("ensures a system-assigned identity and returns the principal id", async () => {
  const fetchImpl = vi
    .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .mockResolvedValue(json({ identity: { principalId: "principal-guid" } }));
  const client = createAzureArmClient({
    subscriptionId: "sub",
    tokenProvider: async () => "token",
    fetchImpl,
  });

  await expect(
    client.ensureSystemAssignedIdentity({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
    }),
  ).resolves.toEqual({ principalId: "principal-guid" });

  expect(fetchImpl).toHaveBeenCalledWith(
    "https://management.azure.com/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.Web/sites/app-campus-dashboard-clx9abc1?api-version=2023-12-01",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ identity: { type: "SystemAssigned" } }),
    }),
  );
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/features/publishing/azure/arm-client.test.ts`
Expected: FAIL — new methods missing, plus the updated putWebApp body expectation failing.

- [ ] **Step 4: Implement**

In `arm-client.ts`:

Add at the top:

```ts
import { createHash } from "node:crypto";
```

Add after the type declarations:

```ts
export const KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID =
  "4633458b-17de-408a-b874-0445c86b69e6";

function deterministicGuid(input: string) {
  const hash = createHash("sha256").update(input).digest("hex");

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}
```

Update `AzureWebAppResponse`:

```ts
type AzureWebAppResponse = {
  properties?: {
    defaultHostName?: string;
  };
  identity?: {
    principalId?: string;
  };
};
```

In `putWebApp`, change the PUT body to include the identity block between `kind` and `tags`:

```ts
            body: JSON.stringify({
              location: input.location,
              kind: "app,linux",
              identity: { type: "SystemAssigned" },
              tags: input.tags,
              properties: {
                serverFarmId: input.appServicePlanId,
                httpsOnly: true,
                siteConfig: {
                  linuxFxVersion: input.runtimeStack,
                  appCommandLine: input.startupCommand,
                },
              },
            }),
```

Add these methods to the returned object (alongside the existing ones):

```ts
    keyVaultId(resourceGroup: string, name: string) {
      return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.KeyVault/vaults/${name}`;
    },
    async putKeyVault(input: {
      resourceGroup: string;
      name: string;
      location: string;
      tenantId: string;
      tags: Record<string, string>;
    }) {
      const data = await readJson<{ properties?: { vaultUri?: string } }>(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.KeyVault/vaults/${input.name}`,
            "2023-07-01",
          ),
          {
            method: "PUT",
            headers: await headers(),
            body: JSON.stringify({
              location: input.location,
              tags: input.tags,
              properties: {
                tenantId: input.tenantId,
                sku: { family: "A", name: "standard" },
                enableRbacAuthorization: true,
              },
            }),
          },
        ),
      );
      const vaultUri =
        data.properties?.vaultUri ?? `https://${input.name}.vault.azure.net`;

      return { vaultUri: vaultUri.replace(/\/+$/, "") };
    },
    async deleteKeyVault(input: { resourceGroup: string; name: string }) {
      await requireAzureStatus(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.KeyVault/vaults/${input.name}`,
            "2023-07-01",
          ),
          {
            method: "DELETE",
            headers: await headers(),
          },
        ),
        [200, 202, 204, 404],
      );
    },
    async putRoleAssignment(input: {
      scope: string;
      roleDefinitionId: string;
      principalId: string;
    }) {
      const assignmentName = deterministicGuid(
        `${input.scope}|${input.roleDefinitionId}|${input.principalId}`,
      );
      const response = await fetchImpl(
        `https://management.azure.com${input.scope}/providers/Microsoft.Authorization/roleAssignments/${assignmentName}?api-version=2022-04-01`,
        {
          method: "PUT",
          headers: await headers(),
          body: JSON.stringify({
            properties: {
              roleDefinitionId: `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${input.roleDefinitionId}`,
              principalId: input.principalId,
              principalType: "ServicePrincipal",
            },
          }),
        },
      );

      if (response.status === 409) {
        await response.text();

        return;
      }

      await readJson<unknown>(response);
    },
    async ensureSystemAssignedIdentity(input: {
      resourceGroup: string;
      name: string;
    }) {
      const data = await readJson<AzureWebAppResponse>(
        await fetchImpl(
          resourceUrl(
            `/resourceGroups/${input.resourceGroup}/providers/Microsoft.Web/sites/${input.name}`,
            "2023-12-01",
          ),
          {
            method: "PATCH",
            headers: await headers(),
            body: JSON.stringify({ identity: { type: "SystemAssigned" } }),
          },
        ),
      );

      if (!data.identity?.principalId) {
        throw new Error(
          `Azure web app ${input.name} did not return a managed identity principal.`,
        );
      }

      return { principalId: data.identity.principalId };
    },
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- src/features/publishing/azure/arm-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/publishing/azure/arm-client.ts src/features/publishing/azure/arm-client.test.ts
git commit -m "feat: add key vault, role assignment, and managed identity ARM operations

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Key Vault data-plane client

**Files:**
- Create: `src/features/publishing/azure/key-vault-client.ts`
- Test: `src/features/publishing/azure/key-vault-client.test.ts`

**Interfaces:**
- Produces: `createKeyVaultClient({ vaultUri, tokenProvider, fetchImpl? })` returning `{ setSecret(input: { name: string; value: string }): Promise<void>; deleteSecret(input: { name: string }): Promise<void> }`. The token scope callers must use is `https://vault.azure.net/.default`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/publishing/azure/key-vault-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createKeyVaultClient } from "./key-vault-client";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function text(body: string, init: ResponseInit) {
  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
    ...init,
  });
}

describe("createKeyVaultClient", () => {
  it("sets a secret value", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(json({ value: "s3cret" }));
    const client = createKeyVaultClient({
      vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net/",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.setSecret({ name: "API-KEY", value: "s3cret" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://kv-campus-dashb-clx9abc1.vault.azure.net/secrets/API-KEY?api-version=7.4",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
        body: JSON.stringify({ value: "s3cret" }),
      }),
    );
  });

  it("throws the response status and text on failure", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValue(text("forbidden", { status: 403 }));
    const client = createKeyVaultClient({
      vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await expect(
      client.setSecret({ name: "API-KEY", value: "s3cret" }),
    ).rejects.toThrow("Azure Key Vault request failed: 403 forbidden");
  });

  it("deletes a secret and tolerates a missing secret", async () => {
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(json({ deletedDate: 1 }))
      .mockResolvedValueOnce(text("not found", { status: 404 }));
    const client = createKeyVaultClient({
      vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
      tokenProvider: async () => "token",
      fetchImpl,
    });

    await client.deleteSecret({ name: "API-KEY" });
    await client.deleteSecret({ name: "MISSING" });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://kv-campus-dashb-clx9abc1.vault.azure.net/secrets/API-KEY?api-version=7.4",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/features/publishing/azure/key-vault-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/publishing/azure/key-vault-client.ts`:

```ts
type FetchLike = typeof fetch;

type KeyVaultClientOptions = {
  vaultUri: string;
  tokenProvider: () => Promise<string>;
  fetchImpl?: FetchLike;
};

const KEY_VAULT_API_VERSION = "7.4";

export function createKeyVaultClient({
  vaultUri,
  tokenProvider,
  fetchImpl = fetch,
}: KeyVaultClientOptions) {
  const baseUrl = vaultUri.replace(/\/+$/, "");

  async function headers() {
    return {
      Authorization: `Bearer ${await tokenProvider()}`,
      "Content-Type": "application/json",
    };
  }

  async function requireOk(response: Response) {
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Azure Key Vault request failed: ${response.status} ${text}`,
      );
    }
  }

  return {
    async setSecret(input: { name: string; value: string }) {
      await requireOk(
        await fetchImpl(
          `${baseUrl}/secrets/${input.name}?api-version=${KEY_VAULT_API_VERSION}`,
          {
            method: "PUT",
            headers: await headers(),
            body: JSON.stringify({ value: input.value }),
          },
        ),
      );
    },
    async deleteSecret(input: { name: string }) {
      const response = await fetchImpl(
        `${baseUrl}/secrets/${input.name}?api-version=${KEY_VAULT_API_VERSION}`,
        {
          method: "DELETE",
          headers: await headers(),
        },
      );

      if (response.status === 404) {
        await response.text();

        return;
      }

      await requireOk(response);
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/publishing/azure/key-vault-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/publishing/azure/key-vault-client.ts src/features/publishing/azure/key-vault-client.test.ts
git commit -m "feat: add key vault data-plane client

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: User app-settings builder (Key Vault references)

**Files:**
- Create: `src/features/env-vars/settings.ts`
- Test: `src/features/env-vars/settings.test.ts`

**Interfaces:**
- Consumes: `toKeyVaultSecretName` from `@/features/publishing/azure/naming` (Task 2).
- Produces:
  - `type EnvVarForSettings = { key: string; isSecret: boolean; value: string | null }`
  - `keyVaultReference(vaultUri: string, key: string): string`
  - `buildUserAppSettings(envVars: EnvVarForSettings[], vaultUri: string | null): Record<string, string>` — throws if a secret exists with no vaultUri.

- [ ] **Step 1: Write the failing tests**

Create `src/features/env-vars/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildUserAppSettings, keyVaultReference } from "./settings";

describe("keyVaultReference", () => {
  it("builds a key vault app setting reference from the env key", () => {
    expect(
      keyVaultReference("https://kv-campus-dashb-clx9abc1.vault.azure.net", "API_KEY"),
    ).toBe(
      "@Microsoft.KeyVault(SecretUri=https://kv-campus-dashb-clx9abc1.vault.azure.net/secrets/API-KEY)",
    );
  });

  it("tolerates a trailing slash on the vault uri", () => {
    expect(
      keyVaultReference("https://kv-x.vault.azure.net/", "TOKEN"),
    ).toBe("@Microsoft.KeyVault(SecretUri=https://kv-x.vault.azure.net/secrets/TOKEN)");
  });
});

describe("buildUserAppSettings", () => {
  it("maps non-secrets to literal values and secrets to references", () => {
    expect(
      buildUserAppSettings(
        [
          { key: "FEATURE_FLAG", isSecret: false, value: "on" },
          { key: "API_KEY", isSecret: true, value: null },
        ],
        "https://kv-x.vault.azure.net",
      ),
    ).toEqual({
      FEATURE_FLAG: "on",
      API_KEY: "@Microsoft.KeyVault(SecretUri=https://kv-x.vault.azure.net/secrets/API-KEY)",
    });
  });

  it("treats a null non-secret value as an empty string", () => {
    expect(
      buildUserAppSettings([{ key: "EMPTY", isSecret: false, value: null }], null),
    ).toEqual({ EMPTY: "" });
  });

  it("throws when a secret exists without a vault", () => {
    expect(() =>
      buildUserAppSettings([{ key: "API_KEY", isSecret: true, value: null }], null),
    ).toThrow("no Key Vault");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/features/env-vars/settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/env-vars/settings.ts`:

```ts
import { toKeyVaultSecretName } from "@/features/publishing/azure/naming";

export type EnvVarForSettings = {
  key: string;
  isSecret: boolean;
  value: string | null;
};

export function keyVaultReference(vaultUri: string, key: string) {
  const baseUrl = vaultUri.replace(/\/+$/, "");

  return `@Microsoft.KeyVault(SecretUri=${baseUrl}/secrets/${toKeyVaultSecretName(key)})`;
}

export function buildUserAppSettings(
  envVars: EnvVarForSettings[],
  vaultUri: string | null,
): Record<string, string> {
  const settings: Record<string, string> = {};

  for (const envVar of envVars) {
    if (envVar.isSecret) {
      if (!vaultUri) {
        throw new Error(
          `Secret variable ${envVar.key} exists but the app has no Key Vault.`,
        );
      }

      settings[envVar.key] = keyVaultReference(vaultUri, envVar.key);
    } else {
      settings[envVar.key] = envVar.value ?? "";
    }
  }

  return settings;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/env-vars/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/env-vars/settings.ts src/features/env-vars/settings.test.ts
git commit -m "feat: build user app settings with key vault references

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Publish integration — merge env vars, vault, identity, role assignment

**Files:**
- Modify: `src/features/publishing/azure/runtime.ts`
- Modify: `src/features/publishing/run-publish-attempt.ts` (`ProvisionedPublishTarget` type, lines 16-24)
- Test: `src/features/publishing/azure/runtime.test.ts`

**Interfaces:**
- Consumes: `buildUserAppSettings` (Task 6), naming `keyVaultName` (Task 2), ARM methods (Task 4).
- Produces:
  - `ProvisionedPublishTarget` gains `azureKeyVaultName: string | null; azureKeyVaultUri: string | null` (persisted to `AppRequest` by the existing `prisma.appRequest.update({ data: publishTarget })` in `run-publish-attempt.ts` — no change needed there beyond the type).
  - `RuntimeDeps.prisma` becomes `Pick<PrismaClient, "appRequest" | "appEnvironmentVariable">`.
  - `RuntimeDeps.arm` gains `keyVaultId`, `putKeyVault`, `putRoleAssignment`, `ensureSystemAssignedIdentity` with the Task 4 signatures, and `putWebApp`'s return type gains `identity?: { principalId?: string }`.

- [ ] **Step 1: Update the test fixture and add failing tests**

In `runtime.test.ts` `createDeps` (line 123):

- Extend the `arm` mock:

```ts
  const arm = {
    appServicePlanId: vi.fn().mockReturnValue("/plans/asp-cu-apps-published"),
    keyVaultId: vi.fn(
      (resourceGroup: string, name: string) =>
        `/subscriptions/sub-id/resourceGroups/${resourceGroup}/providers/Microsoft.KeyVault/vaults/${name}`,
    ),
    putWebApp: vi.fn().mockResolvedValue({
      properties: {
        defaultHostName: "app-campus-dashboard-clx9abc1.azurewebsites.net",
      },
      identity: { principalId: "webapp-principal" },
    }),
    putAppSettings: vi.fn().mockResolvedValue(undefined),
    putPostgresDatabase: vi.fn().mockResolvedValue(undefined),
    putKeyVault: vi.fn().mockResolvedValue({
      vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
    }),
    putRoleAssignment: vi.fn().mockResolvedValue(undefined),
    ensureSystemAssignedIdentity: vi
      .fn()
      .mockResolvedValue({ principalId: "webapp-principal" }),
  };
```

- Extend the `prisma` mock and let callers override env vars (add an `environmentVariables = []` parameter to `createDeps`'s options object):

```ts
  const prisma = {
    appRequest: {
      findUnique: vi.fn().mockResolvedValue(appRequest),
      update: vi.fn().mockResolvedValue(appRequest),
    },
    appEnvironmentVariable: {
      findMany: vi.fn().mockResolvedValue(environmentVariables),
    },
  };
```

Then add these tests to the describe block:

```ts
it("merges user environment variables into app settings at publish", async () => {
  const { deps, arm } = createDeps({
    environmentVariables: [
      { key: "FEATURE_FLAG", isSecret: false, value: "on" },
    ],
  });
  const runtime = createAzurePublishRuntime(deps);

  const target = await runtime.provisionInfrastructure("clx9abc123zzzzzzzzzz");

  expect(arm.putAppSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({
        FEATURE_FLAG: "on",
        NODE_ENV: "production",
      }),
    }),
  );
  expect(arm.putKeyVault).not.toHaveBeenCalled();
  expect(arm.putRoleAssignment).not.toHaveBeenCalled();
  expect(target).toEqual(
    expect.objectContaining({
      azureKeyVaultName: null,
      azureKeyVaultUri: null,
    }),
  );
});

it("provisions a key vault, identity access, and reference settings for secrets", async () => {
  const { deps, arm } = createDeps({
    environmentVariables: [{ key: "API_KEY", isSecret: true, value: null }],
  });
  const runtime = createAzurePublishRuntime(deps);

  const target = await runtime.provisionInfrastructure("clx9abc123zzzzzzzzzz");

  expect(arm.putKeyVault).toHaveBeenCalledWith({
    resourceGroup: "rg-cu-apps-published",
    name: "kv-campus-dashb-clx9abc1",
    location: "eastus2",
    tenantId: "tenant-id",
    tags: expect.objectContaining({
      managedBy: "cu-app-portal",
      appRequestId: "clx9abc123zzzzzzzzzz",
    }),
  });
  expect(arm.putRoleAssignment).toHaveBeenCalledWith({
    scope:
      "/subscriptions/sub-id/resourceGroups/rg-cu-apps-published/providers/Microsoft.KeyVault/vaults/kv-campus-dashb-clx9abc1",
    roleDefinitionId: "4633458b-17de-408a-b874-0445c86b69e6",
    principalId: "webapp-principal",
  });
  expect(arm.putAppSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({
        API_KEY:
          "@Microsoft.KeyVault(SecretUri=https://kv-campus-dashb-clx9abc1.vault.azure.net/secrets/API-KEY)",
      }),
    }),
  );
  expect(target).toEqual(
    expect.objectContaining({
      azureKeyVaultName: "kv-campus-dashb-clx9abc1",
      azureKeyVaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
    }),
  );
});

it("never lets user variables shadow portal-reserved settings", async () => {
  const { deps, arm } = createDeps({
    environmentVariables: [
      // Defense in depth: reserved keys are rejected at save time, but if a
      // row slips in the reserved value must still win.
      { key: "NODE_ENV", isSecret: false, value: "development" },
    ],
  });
  const runtime = createAzurePublishRuntime(deps);

  await runtime.provisionInfrastructure("clx9abc123zzzzzzzzzz");

  expect(arm.putAppSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({ NODE_ENV: "production" }),
    }),
  );
});
```

Note the expected vault name `kv-campus-dashb-clx9abc1` must match Task 2's actual `buildPublishTargetNames` output for `requestId: "clx9abc123zzzzzzzzzz", appName: "Campus Dashboard"` — reuse whatever value Task 2's test settled on.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/features/publishing/azure/runtime.test.ts`
Expected: new tests FAIL (no vault handling, `azureKeyVaultName` undefined); existing tests still pass.

- [ ] **Step 3: Implement**

In `run-publish-attempt.ts`, extend `ProvisionedPublishTarget`:

```ts
export type ProvisionedPublishTarget = {
  azureResourceGroup: string;
  azureAppServicePlan: string;
  azureWebAppName: string;
  azurePostgresServer: string;
  azureDatabaseName: string | null;
  azureKeyVaultName: string | null;
  azureKeyVaultUri: string | null;
  azureDefaultHostName: string;
  primaryPublishUrl: string;
};
```

In `runtime.ts`:

1. Change the prisma dep: `prisma: Pick<PrismaClient, "appRequest" | "appEnvironmentVariable">;`
2. Extend `RuntimeDeps["arm"]`:

```ts
    keyVaultId(resourceGroup: string, name: string): string;
    putWebApp(input: {
      resourceGroup: string;
      name: string;
      location: string;
      appServicePlanId: string;
      runtimeStack: string;
      startupCommand: string;
      tags: Record<string, string>;
    }): Promise<{
      properties?: { defaultHostName?: string };
      identity?: { principalId?: string };
    }>;
    putKeyVault(input: {
      resourceGroup: string;
      name: string;
      location: string;
      tenantId: string;
      tags: Record<string, string>;
    }): Promise<{ vaultUri: string }>;
    putRoleAssignment(input: {
      scope: string;
      roleDefinitionId: string;
      principalId: string;
    }): Promise<void>;
    ensureSystemAssignedIdentity(input: {
      resourceGroup: string;
      name: string;
    }): Promise<{ principalId: string }>;
```

3. Add imports:

```ts
import { buildUserAppSettings } from "@/features/env-vars/settings";
import { KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID } from "./arm-client";
```

4. Add `azureKeyVaultName` / `azureKeyVaultUri` to `PublishableAppRequest`:

```ts
  azureKeyVaultName: string | null;
  azureKeyVaultUri: string | null;
```

and map them in `loadPublishableRequest`'s return object:

```ts
    azureKeyVaultName: appRequest.azureKeyVaultName ?? null,
    azureKeyVaultUri: appRequest.azureKeyVaultUri ?? null,
```

5. In `provisionInfrastructure`, after computing `tags` and before `putWebApp`, load env vars and ensure the vault:

```ts
      const environmentVariables =
        await deps.prisma.appEnvironmentVariable.findMany({
          where: { appRequestId: appRequest.id },
        });
      const hasSecretVariables = environmentVariables.some(
        (variable) => variable.isSecret,
      );
      let keyVaultName = appRequest.azureKeyVaultName;
      let keyVaultUri = appRequest.azureKeyVaultUri;

      if (hasSecretVariables) {
        keyVaultName = keyVaultName ?? names.keyVaultName;
        const vault = await deps.arm.putKeyVault({
          resourceGroup: deps.config.resourceGroup,
          name: keyVaultName,
          location: deps.config.location,
          tenantId: deps.config.azureTenantId,
          tags,
        });
        keyVaultUri = vault.vaultUri;
      }
```

6. After `putWebApp` (which now returns `identity`), grant vault access when a vault is in play:

```ts
      if (keyVaultName && keyVaultUri) {
        const principalId =
          webApp.identity?.principalId ??
          (
            await deps.arm.ensureSystemAssignedIdentity({
              resourceGroup: deps.config.resourceGroup,
              name: names.webAppName,
            })
          ).principalId;

        await deps.arm.putRoleAssignment({
          scope: deps.arm.keyVaultId(deps.config.resourceGroup, keyVaultName),
          roleDefinitionId: KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID,
          principalId,
        });
      }
```

7. Change the settings construction so user vars are merged first and reserved settings always win:

```ts
      const settings: Record<string, string> = {
        ...buildUserAppSettings(environmentVariables, keyVaultUri),
        NODE_ENV: "production",
        SCM_DO_BUILD_DURING_DEPLOYMENT: "false",
        ENABLE_ORYX_BUILD: "false",
        WEBSITE_RUN_FROM_PACKAGE: "1",
      };
```

(The existing conditional `DATABASE_URL` / `AUTH_*` assignments after this block stay as they are — they also overwrite any user value.)

8. Extend the returned target:

```ts
        azureKeyVaultName: keyVaultName ?? null,
        azureKeyVaultUri: keyVaultUri ?? null,
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/publishing/azure/runtime.test.ts src/features/publishing/run-publish-attempt.test.ts`
Expected: PASS. If `run-publish-attempt.test.ts` fixtures construct a `ProvisionedPublishTarget`, add the two new null fields there.

- [ ] **Step 5: Commit**

```bash
git add src/features/publishing/azure/runtime.ts src/features/publishing/azure/runtime.test.ts src/features/publishing/run-publish-attempt.ts src/features/publishing/run-publish-attempt.test.ts
git commit -m "feat: merge user env vars and provision key vault access at publish

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Env var service (save/delete against Azure + DB)

**Files:**
- Create: `src/features/env-vars/service.ts`
- Test: `src/features/env-vars/service.test.ts`
- Modify: `src/lib/audit.ts` (add two events)

**Interfaces:**
- Consumes: validation (Task 3), settings (Task 6), naming (Task 2), ARM/KV client shapes (Tasks 4-5).
- Produces:
  - `type EnvVarAppRequest = { id: string; appName: string; azureWebAppName: string | null; azureKeyVaultName: string | null; azureKeyVaultUri: string | null }`
  - `saveEnvironmentVariable(deps: EnvVarServiceDeps, input: { appRequest: EnvVarAppRequest; key: string; value: string; isSecret: boolean }): Promise<void>` — throws `Error` with a user-facing message on any validation or Azure failure.
  - `deleteEnvironmentVariable(deps: EnvVarServiceDeps, input: { appRequest: EnvVarAppRequest; key: string }): Promise<void>`
  - `createDefaultEnvVarServiceDeps(): EnvVarServiceDeps`
  - Audit events `"ENV_VAR_SET"` and `"ENV_VAR_DELETED"` exist in `AUDIT_EVENTS`.

- [ ] **Step 1: Add the audit events**

In `src/lib/audit.ts`, add to `AUDIT_EVENTS` (after `"PUSH_TO_DEPLOY_ENABLED"`):

```ts
  "ENV_VAR_SET",
  "ENV_VAR_DELETED",
```

- [ ] **Step 2: Write the failing tests**

Create `src/features/env-vars/service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  deleteEnvironmentVariable,
  saveEnvironmentVariable,
  type EnvVarAppRequest,
} from "./service";

const unpublishedAppRequest: EnvVarAppRequest = {
  id: "clx9abc123zzzzzzzzzz",
  appName: "Campus Dashboard",
  azureWebAppName: null,
  azureKeyVaultName: null,
  azureKeyVaultUri: null,
};

const publishedAppRequest: EnvVarAppRequest = {
  ...unpublishedAppRequest,
  azureWebAppName: "app-campus-dashboard-clx9abc1",
};

const publishedWithVault: EnvVarAppRequest = {
  ...publishedAppRequest,
  azureKeyVaultName: "kv-campus-dashb-clx9abc1",
  azureKeyVaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
};

function createDeps({
  existingVariables = [] as Array<{
    key: string;
    isSecret: boolean;
    value: string | null;
  }>,
} = {}) {
  const keyVault = {
    setSecret: vi.fn().mockResolvedValue(undefined),
    deleteSecret: vi.fn().mockResolvedValue(undefined),
  };
  const arm = {
    keyVaultId: vi.fn(
      (resourceGroup: string, name: string) =>
        `/subscriptions/sub/resourceGroups/${resourceGroup}/providers/Microsoft.KeyVault/vaults/${name}`,
    ),
    putKeyVault: vi.fn().mockResolvedValue({
      vaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
    }),
    getAppSettings: vi.fn().mockResolvedValue({
      exists: true,
      settings: { NODE_ENV: "production", KEEP_ME: "yes" },
    }),
    putAppSettings: vi.fn().mockResolvedValue(undefined),
    putRoleAssignment: vi.fn().mockResolvedValue(undefined),
    ensureSystemAssignedIdentity: vi
      .fn()
      .mockResolvedValue({ principalId: "webapp-principal" }),
  };
  const prisma = {
    appRequest: {
      update: vi.fn().mockResolvedValue({}),
    },
    appEnvironmentVariable: {
      findMany: vi.fn().mockResolvedValue(existingVariables),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  };

  return {
    deps: {
      prisma: prisma as never,
      config: {
        resourceGroup: "rg-cu-apps-published",
        location: "eastus2",
        azureTenantId: "tenant-id",
      },
      arm,
      createKeyVaultClient: vi.fn().mockReturnValue(keyVault),
    },
    prisma,
    arm,
    keyVault,
  };
}

describe("saveEnvironmentVariable", () => {
  it("stores a non-secret for an unpublished app without touching azure", async () => {
    const { deps, prisma, arm } = createDeps();

    await saveEnvironmentVariable(deps, {
      appRequest: unpublishedAppRequest,
      key: "FEATURE_FLAG",
      value: "on",
      isSecret: false,
    });

    expect(arm.putKeyVault).not.toHaveBeenCalled();
    expect(arm.putAppSettings).not.toHaveBeenCalled();
    expect(prisma.appEnvironmentVariable.upsert).toHaveBeenCalledWith({
      where: {
        appRequestId_key: {
          appRequestId: "clx9abc123zzzzzzzzzz",
          key: "FEATURE_FLAG",
        },
      },
      create: {
        appRequestId: "clx9abc123zzzzzzzzzz",
        key: "FEATURE_FLAG",
        isSecret: false,
        value: "on",
      },
      update: { isSecret: false, value: "on" },
    });
  });

  it("rejects reserved keys", async () => {
    const { deps, prisma } = createDeps();

    await expect(
      saveEnvironmentVariable(deps, {
        appRequest: unpublishedAppRequest,
        key: "DATABASE_URL",
        value: "x",
        isSecret: false,
      }),
    ).rejects.toThrow("reserved");
    expect(prisma.appEnvironmentVariable.upsert).not.toHaveBeenCalled();
  });

  it("rejects a key that clashes case-insensitively with an existing variable", async () => {
    const { deps } = createDeps({
      existingVariables: [{ key: "API_KEY", isSecret: false, value: "x" }],
    });

    await expect(
      saveEnvironmentVariable(deps, {
        appRequest: unpublishedAppRequest,
        key: "api_key",
        value: "y",
        isSecret: false,
      }),
    ).rejects.toThrow('already exists as "API_KEY"');
  });

  it("rejects changing a variable between secret and non-secret", async () => {
    const { deps } = createDeps({
      existingVariables: [{ key: "API_KEY", isSecret: true, value: null }],
    });

    await expect(
      saveEnvironmentVariable(deps, {
        appRequest: unpublishedAppRequest,
        key: "API_KEY",
        value: "y",
        isSecret: false,
      }),
    ).rejects.toThrow("Delete it first");
  });

  it("creates the vault lazily, stores the secret, and records vault fields", async () => {
    const { deps, prisma, keyVault } = createDeps();

    await saveEnvironmentVariable(deps, {
      appRequest: unpublishedAppRequest,
      key: "API_KEY",
      value: "s3cret",
      isSecret: true,
    });

    expect(deps.arm.putKeyVault).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      name: "kv-campus-dashb-clx9abc1",
      location: "eastus2",
      tenantId: "tenant-id",
      tags: {
        managedBy: "cu-app-portal",
        appRequestId: "clx9abc123zzzzzzzzzz",
      },
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "clx9abc123zzzzzzzzzz" },
      data: {
        azureKeyVaultName: "kv-campus-dashb-clx9abc1",
        azureKeyVaultUri: "https://kv-campus-dashb-clx9abc1.vault.azure.net",
      },
    });
    expect(keyVault.setSecret).toHaveBeenCalledWith({
      name: "API-KEY",
      value: "s3cret",
    });
    expect(prisma.appEnvironmentVariable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isSecret: true, value: null }),
      }),
    );
  });

  it("merges into live app settings and grants vault access for a published app", async () => {
    const { deps, arm } = createDeps();

    await saveEnvironmentVariable(deps, {
      appRequest: publishedAppRequest,
      key: "API_KEY",
      value: "s3cret",
      isSecret: true,
    });

    expect(arm.ensureSystemAssignedIdentity).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
    });
    expect(arm.putRoleAssignment).toHaveBeenCalledWith({
      scope:
        "/subscriptions/sub/resourceGroups/rg-cu-apps-published/providers/Microsoft.KeyVault/vaults/kv-campus-dashb-clx9abc1",
      roleDefinitionId: "4633458b-17de-408a-b874-0445c86b69e6",
      principalId: "webapp-principal",
    });
    expect(arm.putAppSettings).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
      settings: {
        NODE_ENV: "production",
        KEEP_ME: "yes",
        API_KEY:
          "@Microsoft.KeyVault(SecretUri=https://kv-campus-dashb-clx9abc1.vault.azure.net/secrets/API-KEY)",
      },
    });
  });

  it("does not persist the row when azure fails", async () => {
    const { deps, prisma, arm } = createDeps();
    arm.putAppSettings.mockRejectedValue(new Error("Azure ARM request failed: 403"));

    await expect(
      saveEnvironmentVariable(deps, {
        appRequest: publishedAppRequest,
        key: "FEATURE_FLAG",
        value: "on",
        isSecret: false,
      }),
    ).rejects.toThrow("403");
    expect(prisma.appEnvironmentVariable.upsert).not.toHaveBeenCalled();
  });
});

describe("deleteEnvironmentVariable", () => {
  it("removes the app setting, vault secret, and row", async () => {
    const { deps, prisma, arm, keyVault } = createDeps({
      existingVariables: [{ key: "API_KEY", isSecret: true, value: null }],
    });

    await deleteEnvironmentVariable(deps, {
      appRequest: publishedWithVault,
      key: "API_KEY",
    });

    expect(arm.putAppSettings).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      name: "app-campus-dashboard-clx9abc1",
      settings: { NODE_ENV: "production", KEEP_ME: "yes" },
    });
    expect(keyVault.deleteSecret).toHaveBeenCalledWith({ name: "API-KEY" });
    expect(prisma.appEnvironmentVariable.delete).toHaveBeenCalledWith({
      where: {
        appRequestId_key: {
          appRequestId: "clx9abc123zzzzzzzzzz",
          key: "API_KEY",
        },
      },
    });
  });

  it("throws when the variable does not exist", async () => {
    const { deps } = createDeps();

    await expect(
      deleteEnvironmentVariable(deps, {
        appRequest: publishedWithVault,
        key: "MISSING",
      }),
    ).rejects.toThrow("was not found");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/features/env-vars/service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `src/features/env-vars/service.ts`:

```ts
import { DefaultAzureCredential } from "@azure/identity";
import type { PrismaClient } from "@prisma/client";
import {
  createAzureArmClient,
  KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID,
} from "@/features/publishing/azure/arm-client";
import { loadAzurePublishConfig } from "@/features/publishing/azure/config";
import { createKeyVaultClient } from "@/features/publishing/azure/key-vault-client";
import {
  buildPublishTargetNames,
  toKeyVaultSecretName,
} from "@/features/publishing/azure/naming";
import { prisma } from "@/lib/db";
import { keyVaultReference } from "./settings";
import {
  normalizeEnvVarKey,
  validateEnvVarKey,
  validateEnvVarValue,
} from "./validation";

export type EnvVarAppRequest = {
  id: string;
  appName: string;
  azureWebAppName: string | null;
  azureKeyVaultName: string | null;
  azureKeyVaultUri: string | null;
};

export type EnvVarServiceDeps = {
  prisma: Pick<PrismaClient, "appRequest" | "appEnvironmentVariable">;
  config: {
    resourceGroup: string;
    location: string;
    azureTenantId: string;
  };
  arm: {
    keyVaultId(resourceGroup: string, name: string): string;
    putKeyVault(input: {
      resourceGroup: string;
      name: string;
      location: string;
      tenantId: string;
      tags: Record<string, string>;
    }): Promise<{ vaultUri: string }>;
    getAppSettings(input: {
      resourceGroup: string;
      name: string;
    }): Promise<{ exists: boolean; settings: Record<string, string> }>;
    putAppSettings(input: {
      resourceGroup: string;
      name: string;
      settings: Record<string, string>;
    }): Promise<void>;
    putRoleAssignment(input: {
      scope: string;
      roleDefinitionId: string;
      principalId: string;
    }): Promise<void>;
    ensureSystemAssignedIdentity(input: {
      resourceGroup: string;
      name: string;
    }): Promise<{ principalId: string }>;
  };
  createKeyVaultClient(vaultUri: string): {
    setSecret(input: { name: string; value: string }): Promise<void>;
    deleteSecret(input: { name: string }): Promise<void>;
  };
};

function createAzureTokenProvider(scope: string) {
  const credential = new DefaultAzureCredential();

  return async () => {
    const token = await credential.getToken(scope);

    if (!token?.token) {
      throw new Error(`Azure token was not available for scope ${scope}.`);
    }

    return token.token;
  };
}

export function createDefaultEnvVarServiceDeps(): EnvVarServiceDeps {
  const config = loadAzurePublishConfig();
  const vaultTokenProvider = createAzureTokenProvider(
    "https://vault.azure.net/.default",
  );

  return {
    prisma,
    config: {
      resourceGroup: config.resourceGroup,
      location: config.location,
      azureTenantId: config.azureTenantId,
    },
    arm: createAzureArmClient({
      subscriptionId: config.azureSubscriptionId,
      tokenProvider: createAzureTokenProvider(
        "https://management.azure.com/.default",
      ),
    }),
    createKeyVaultClient: (vaultUri: string) =>
      createKeyVaultClient({ vaultUri, tokenProvider: vaultTokenProvider }),
  };
}

async function ensureKeyVault(
  deps: EnvVarServiceDeps,
  appRequest: EnvVarAppRequest,
): Promise<{ name: string; uri: string }> {
  if (appRequest.azureKeyVaultName && appRequest.azureKeyVaultUri) {
    return {
      name: appRequest.azureKeyVaultName,
      uri: appRequest.azureKeyVaultUri,
    };
  }

  const names = buildPublishTargetNames({
    requestId: appRequest.id,
    appName: appRequest.appName,
  });
  const vault = await deps.arm.putKeyVault({
    resourceGroup: deps.config.resourceGroup,
    name: names.keyVaultName,
    location: deps.config.location,
    tenantId: deps.config.azureTenantId,
    tags: {
      managedBy: "cu-app-portal",
      appRequestId: appRequest.id,
    },
  });

  await deps.prisma.appRequest.update({
    where: { id: appRequest.id },
    data: {
      azureKeyVaultName: names.keyVaultName,
      azureKeyVaultUri: vault.vaultUri,
    },
  });

  return { name: names.keyVaultName, uri: vault.vaultUri };
}

async function applyLiveSetting(
  deps: EnvVarServiceDeps,
  webAppName: string,
  mutate: (settings: Record<string, string>) => void,
) {
  const current = await deps.arm.getAppSettings({
    resourceGroup: deps.config.resourceGroup,
    name: webAppName,
  });

  if (!current.exists) {
    throw new Error(
      "The Azure app for this request could not be found. Try publishing again first.",
    );
  }

  const settings = { ...current.settings };

  mutate(settings);

  await deps.arm.putAppSettings({
    resourceGroup: deps.config.resourceGroup,
    name: webAppName,
    settings,
  });
}

export async function saveEnvironmentVariable(
  deps: EnvVarServiceDeps,
  input: {
    appRequest: EnvVarAppRequest;
    key: string;
    value: string;
    isSecret: boolean;
  },
) {
  const keyCheck = validateEnvVarKey(input.key);

  if (!keyCheck.ok) {
    throw new Error(keyCheck.error);
  }

  const valueCheck = validateEnvVarValue(input.value, input.isSecret);

  if (!valueCheck.ok) {
    throw new Error(valueCheck.error);
  }

  const existing = await deps.prisma.appEnvironmentVariable.findMany({
    where: { appRequestId: input.appRequest.id },
  });
  const clash = existing.find(
    (variable) =>
      variable.key !== input.key &&
      normalizeEnvVarKey(variable.key) === normalizeEnvVarKey(input.key),
  );

  if (clash) {
    throw new Error(
      `A variable with this name already exists as "${clash.key}".`,
    );
  }

  const current = existing.find((variable) => variable.key === input.key);

  if (current && current.isSecret !== input.isSecret) {
    throw new Error(
      `"${input.key}" already exists as a ${
        current.isSecret ? "secret" : "non-secret"
      } variable. Delete it first to change how it is stored.`,
    );
  }

  let vaultUri: string | null = input.appRequest.azureKeyVaultUri;

  if (input.isSecret) {
    const vault = await ensureKeyVault(deps, input.appRequest);

    vaultUri = vault.uri;
    await deps
      .createKeyVaultClient(vault.uri)
      .setSecret({ name: toKeyVaultSecretName(input.key), value: input.value });

    if (input.appRequest.azureWebAppName) {
      const { principalId } = await deps.arm.ensureSystemAssignedIdentity({
        resourceGroup: deps.config.resourceGroup,
        name: input.appRequest.azureWebAppName,
      });

      await deps.arm.putRoleAssignment({
        scope: deps.arm.keyVaultId(deps.config.resourceGroup, vault.name),
        roleDefinitionId: KEY_VAULT_SECRETS_USER_ROLE_DEFINITION_ID,
        principalId,
      });
    }
  }

  if (input.appRequest.azureWebAppName) {
    await applyLiveSetting(
      deps,
      input.appRequest.azureWebAppName,
      (settings) => {
        settings[input.key] = input.isSecret
          ? keyVaultReference(vaultUri as string, input.key)
          : input.value;
      },
    );
  }

  await deps.prisma.appEnvironmentVariable.upsert({
    where: {
      appRequestId_key: {
        appRequestId: input.appRequest.id,
        key: input.key,
      },
    },
    create: {
      appRequestId: input.appRequest.id,
      key: input.key,
      isSecret: input.isSecret,
      value: input.isSecret ? null : input.value,
    },
    update: {
      isSecret: input.isSecret,
      value: input.isSecret ? null : input.value,
    },
  });
}

export async function deleteEnvironmentVariable(
  deps: EnvVarServiceDeps,
  input: { appRequest: EnvVarAppRequest; key: string },
) {
  const existing = await deps.prisma.appEnvironmentVariable.findMany({
    where: { appRequestId: input.appRequest.id },
  });
  const row = existing.find((variable) => variable.key === input.key);

  if (!row) {
    throw new Error(`Variable "${input.key}" was not found.`);
  }

  if (input.appRequest.azureWebAppName) {
    await applyLiveSetting(
      deps,
      input.appRequest.azureWebAppName,
      (settings) => {
        delete settings[input.key];
      },
    );
  }

  if (row.isSecret && input.appRequest.azureKeyVaultUri) {
    await deps
      .createKeyVaultClient(input.appRequest.azureKeyVaultUri)
      .deleteSecret({ name: toKeyVaultSecretName(input.key) });
  }

  await deps.prisma.appEnvironmentVariable.delete({
    where: {
      appRequestId_key: {
        appRequestId: input.appRequest.id,
        key: input.key,
      },
    },
  });
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- src/features/env-vars/service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/env-vars/service.ts src/features/env-vars/service.test.ts src/lib/audit.ts
git commit -m "feat: add env var save/delete service backed by azure

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Server actions (authz, audit, revalidate)

**Files:**
- Create: `src/features/env-vars/actions.ts`
- Test: `src/features/env-vars/actions.test.ts`

**Interfaces:**
- Consumes: `saveEnvironmentVariable`, `deleteEnvironmentVariable`, `createDefaultEnvVarServiceDeps` (Task 8); `appAccessWhere`, `userHasAdminRole` from `@/features/app-requests/access`; `resolveCurrentUserId` from `@/features/app-requests/current-user`; `recordAuditEvent` from `@/lib/audit`.
- Produces:
  - `type EnvVarFormState = { error: string | null; savedKey: string | null }`
  - `saveEnvVarFormAction(appRequestId: string, prevState: EnvVarFormState, formData: FormData): Promise<EnvVarFormState>` (formData fields: `key`, `value`, checkbox `isSecret` with value `"true"`)
  - `deleteEnvVarAction(appRequestId: string, key: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `src/features/env-vars/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));
vi.mock("@/features/app-requests/access", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/app-requests/access")
  >()),
  userHasAdminRole: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("./service", () => ({
  createDefaultEnvVarServiceDeps: vi.fn().mockReturnValue({ deps: true }),
  saveEnvironmentVariable: vi.fn(),
  deleteEnvironmentVariable: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { userHasAdminRole } from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { deleteEnvVarAction, saveEnvVarFormAction } from "./actions";
import {
  deleteEnvironmentVariable,
  saveEnvironmentVariable,
} from "./service";

const accessibleAppRequest = {
  id: "req-1",
  appName: "Campus Dashboard",
  azureWebAppName: null,
  azureKeyVaultName: null,
  azureKeyVaultUri: null,
};

function formDataOf(entries: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }

  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveCurrentUserId).mockResolvedValue("user-1");
  vi.mocked(userHasAdminRole).mockResolvedValue(false);
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
    accessibleAppRequest as never,
  );
});

describe("saveEnvVarFormAction", () => {
  it("saves the variable, audits, and revalidates", async () => {
    const state = await saveEnvVarFormAction(
      "req-1",
      { error: null, savedKey: null },
      formDataOf({ key: "API_KEY", value: "s3cret", isSecret: "true" }),
    );

    expect(saveEnvironmentVariable).toHaveBeenCalledWith(
      { deps: true },
      {
        appRequest: accessibleAppRequest,
        key: "API_KEY",
        value: "s3cret",
        isSecret: true,
      },
    );
    expect(recordAuditEvent).toHaveBeenCalledWith("ENV_VAR_SET", {
      requestId: "req-1",
      key: "API_KEY",
      isSecret: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/download/req-1");
    expect(state).toEqual({ error: null, savedKey: "API_KEY" });
  });

  it("never passes the secret value to the audit log", async () => {
    await saveEnvVarFormAction(
      "req-1",
      { error: null, savedKey: null },
      formDataOf({ key: "API_KEY", value: "s3cret", isSecret: "true" }),
    );

    const details = vi.mocked(recordAuditEvent).mock.calls[0][1];

    expect(JSON.stringify(details)).not.toContain("s3cret");
  });

  it("returns an inaccessible-app error without calling the service", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

    const state = await saveEnvVarFormAction(
      "req-1",
      { error: null, savedKey: null },
      formDataOf({ key: "API_KEY", value: "x" }),
    );

    expect(state.error).toBe("App request not found.");
    expect(saveEnvironmentVariable).not.toHaveBeenCalled();
  });

  it("surfaces service errors as form state", async () => {
    vi.mocked(saveEnvironmentVariable).mockRejectedValue(
      new Error('"DATABASE_URL" is reserved and managed by the portal.'),
    );

    const state = await saveEnvVarFormAction(
      "req-1",
      { error: null, savedKey: null },
      formDataOf({ key: "DATABASE_URL", value: "x" }),
    );

    expect(state.error).toContain("reserved");
    expect(state.savedKey).toBeNull();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("deleteEnvVarAction", () => {
  it("deletes, audits, and revalidates", async () => {
    await deleteEnvVarAction("req-1", "API_KEY");

    expect(deleteEnvironmentVariable).toHaveBeenCalledWith(
      { deps: true },
      { appRequest: accessibleAppRequest, key: "API_KEY" },
    );
    expect(recordAuditEvent).toHaveBeenCalledWith("ENV_VAR_DELETED", {
      requestId: "req-1",
      key: "API_KEY",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/download/req-1");
  });

  it("throws when the app is not accessible", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

    await expect(deleteEnvVarAction("req-1", "API_KEY")).rejects.toThrow(
      "App request not found.",
    );
    expect(deleteEnvironmentVariable).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/features/env-vars/actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/env-vars/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  appAccessWhere,
  userHasAdminRole,
} from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  createDefaultEnvVarServiceDeps,
  deleteEnvironmentVariable,
  saveEnvironmentVariable,
  type EnvVarAppRequest,
} from "./service";

export type EnvVarFormState = {
  error: string | null;
  savedKey: string | null;
};

async function loadAccessibleEnvVarAppRequest(
  appRequestId: string,
): Promise<EnvVarAppRequest> {
  const userId = await resolveCurrentUserId();
  const isAdmin = await userHasAdminRole(userId);
  const appRequest = await prisma.appRequest.findFirst({
    where: appAccessWhere(appRequestId, userId, isAdmin),
    select: {
      id: true,
      appName: true,
      azureWebAppName: true,
      azureKeyVaultName: true,
      azureKeyVaultUri: true,
    },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return appRequest;
}

export async function saveEnvVarFormAction(
  appRequestId: string,
  _prevState: EnvVarFormState,
  formData: FormData,
): Promise<EnvVarFormState> {
  const key = String(formData.get("key") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  const isSecret = formData.get("isSecret") === "true";

  try {
    const appRequest = await loadAccessibleEnvVarAppRequest(appRequestId);

    await saveEnvironmentVariable(createDefaultEnvVarServiceDeps(), {
      appRequest,
      key,
      value,
      isSecret,
    });
    await recordAuditEvent("ENV_VAR_SET", {
      requestId: appRequestId,
      key,
      isSecret,
    });
    revalidatePath(`/download/${appRequestId}`);

    return { error: null, savedKey: key };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not save the environment variable.",
      savedKey: null,
    };
  }
}

export async function deleteEnvVarAction(appRequestId: string, key: string) {
  const appRequest = await loadAccessibleEnvVarAppRequest(appRequestId);

  await deleteEnvironmentVariable(createDefaultEnvVarServiceDeps(), {
    appRequest,
    key,
  });
  await recordAuditEvent("ENV_VAR_DELETED", {
    requestId: appRequestId,
    key,
  });
  revalidatePath(`/download/${appRequestId}`);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/env-vars/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/env-vars/actions.ts src/features/env-vars/actions.test.ts
git commit -m "feat: add env var server actions with access control and audit

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: UI — Environment Variables panel on the app details screen

**Files:**
- Create: `src/features/env-vars/env-var-form.tsx` (client component)
- Create: `src/features/env-vars/env-vars-panel.tsx` (server-renderable component)
- Test: `src/features/env-vars/env-vars-panel.test.tsx`
- Modify: `src/app/download/[requestId]/page.tsx` (query include at line ~768; render after the "Azure Publishing" card that closes at line ~1187)
- Modify: `src/app/download/[requestId]/page.test.tsx` (add module mock)

**Interfaces:**
- Consumes: `saveEnvVarFormAction`, `deleteEnvVarAction`, `EnvVarFormState` (Task 9); `PendingSubmitButton` from `@/features/forms/pending-submit-button`.
- Produces: `EnvVarsPanel({ appRequestId, envVars, isPublished })` where `envVars: Array<{ key: string; isSecret: boolean; value: string | null; updatedAt: Date }>`.

- [ ] **Step 1: Write the failing panel tests**

Create `src/features/env-vars/env-vars-panel.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("./actions", () => ({
  saveEnvVarFormAction: vi.fn(),
  deleteEnvVarAction: vi.fn(),
}));

import { EnvVarsPanel } from "./env-vars-panel";

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
});

afterEach(() => {
  cleanup();
});

describe("EnvVarsPanel", () => {
  it("lists variables, masks secret values, and offers deletion", () => {
    render(
      <EnvVarsPanel
        appRequestId="req-1"
        isPublished
        envVars={[
          {
            key: "FEATURE_FLAG",
            isSecret: false,
            value: "on",
            updatedAt: new Date("2026-07-08T12:00:00Z"),
          },
          {
            key: "API_KEY",
            isSecret: true,
            value: null,
            updatedAt: new Date("2026-07-08T12:00:00Z"),
          },
        ]}
      />,
    );

    expect(screen.getByText("Environment Variables")).toBeInTheDocument();
    expect(screen.getByText("FEATURE_FLAG")).toBeInTheDocument();
    expect(screen.getByText("on")).toBeInTheDocument();
    expect(screen.getByText("API_KEY")).toBeInTheDocument();
    expect(screen.getByText("••••••••")).toBeInTheDocument();
    expect(screen.getByText("secret")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete FEATURE_FLAG" }),
    ).toBeInTheDocument();
  });

  it("shows an empty state and pre-publish note when unpublished", () => {
    render(<EnvVarsPanel appRequestId="req-1" isPublished={false} envVars={[]} />);

    expect(screen.getByText("No environment variables yet.")).toBeInTheDocument();
    expect(
      screen.getByText(/applied when the app is published/i),
    ).toBeInTheDocument();
  });

  it("explains the live-restart behavior for published apps", () => {
    render(<EnvVarsPanel appRequestId="req-1" isPublished envVars={[]} />);

    expect(screen.getByText(/briefly restart/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/features/env-vars/env-vars-panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client form**

Create `src/features/env-vars/env-var-form.tsx`:

```tsx
"use client";

import React, { useActionState, useEffect, useRef } from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { saveEnvVarFormAction, type EnvVarFormState } from "./actions";

type FormAction = (formData: FormData) => void | Promise<void>;

const initialEnvVarFormState: EnvVarFormState = {
  error: null,
  savedKey: null,
};

export function EnvVarForm({ appRequestId }: { appRequestId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    saveEnvVarFormAction.bind(null, appRequestId),
    initialEnvVarFormState,
  );

  useEffect(() => {
    if (state.savedKey) {
      formRef.current?.reset();
    }
  }, [state.savedKey]);

  return (
    <form
      action={formAction as unknown as FormAction}
      ref={formRef}
      style={{
        display: "flex",
        gap: "0.625rem",
        flexWrap: "wrap",
        alignItems: "flex-end",
        marginBottom: "1rem",
      }}
    >
      <label style={{ display: "grid", gap: "0.25rem", flex: "1 1 180px" }}>
        <span>Name</span>
        <input
          name="key"
          type="text"
          required
          placeholder="API_KEY"
          className="form-control"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label style={{ display: "grid", gap: "0.25rem", flex: "2 1 260px" }}>
        <span>Value</span>
        <input
          name="value"
          type="text"
          placeholder="value"
          className="form-control"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label
        style={{
          display: "flex",
          gap: "0.375rem",
          alignItems: "center",
          paddingBottom: "0.5rem",
        }}
      >
        <input name="isSecret" type="checkbox" value="true" />
        <span>Store as a secret</span>
      </label>
      <PendingSubmitButton
        idleLabel="Save Variable"
        pendingLabel="Saving..."
        statusText="Saving environment variable."
        variant="primary-solid"
        size="sm"
      />
      {state.error ? (
        <div
          className="error-box"
          role="alert"
          style={{ flexBasis: "100%", margin: 0 }}
        >
          {state.error}
        </div>
      ) : null}
      {state.savedKey ? (
        <p
          role="status"
          style={{
            color: "var(--text-secondary)",
            flexBasis: "100%",
            margin: 0,
          }}
        >
          Saved {state.savedKey}. Saving an existing name overwrites its value.
        </p>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 4: Implement the panel**

Create `src/features/env-vars/env-vars-panel.tsx`:

```tsx
import React from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { deleteEnvVarAction } from "./actions";
import { EnvVarForm } from "./env-var-form";

type FormAction = (formData: FormData) => void | Promise<void>;

export type EnvVarListItem = {
  key: string;
  isSecret: boolean;
  value: string | null;
  updatedAt: Date;
};

export function EnvVarsPanel({
  appRequestId,
  envVars,
  isPublished,
}: {
  appRequestId: string;
  envVars: EnvVarListItem[];
  isPublished: boolean;
}) {
  return (
    <section aria-label="Environment variables" className="card">
      <p className="section-title">Environment Variables</p>
      <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
        {isPublished
          ? "Changes apply to your live app within seconds and briefly restart it. Saving an existing name overwrites its value."
          : "Variables you add now are applied when the app is published. Saving an existing name overwrites its value."}{" "}
        Secret values are stored in Azure Key Vault and cannot be viewed again
        after saving.
      </p>
      <EnvVarForm appRequestId={appRequestId} />
      {envVars.length ? (
        <ul
          className="status-table"
          style={{ listStyle: "none", margin: 0, padding: 0 }}
        >
          {envVars.map((envVar) => {
            const deleteAction = deleteEnvVarAction.bind(
              null,
              appRequestId,
              envVar.key,
            ) as unknown as FormAction;

            return (
              <li
                key={envVar.key}
                className="status-row"
                style={{ alignItems: "center", gap: "1rem" }}
              >
                <span
                  style={{
                    display: "grid",
                    gap: "0.25rem",
                    minWidth: 0,
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong style={{ fontFamily: "monospace" }}>
                    {envVar.key}
                  </strong>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {envVar.isSecret ? "••••••••" : envVar.value}
                  </span>
                </span>
                <span
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    justifyContent: "flex-end",
                  }}
                >
                  {envVar.isSecret ? (
                    <span className="badge badge--info">secret</span>
                  ) : null}
                  <form action={deleteAction}>
                    <PendingSubmitButton
                      idleLabel="Delete"
                      pendingLabel="Deleting..."
                      statusText={`Deleting ${envVar.key}.`}
                      variant="danger"
                      size="sm"
                      ariaLabel={`Delete ${envVar.key}`}
                    />
                  </form>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          No environment variables yet.
        </p>
      )}
    </section>
  );
}
```

Check `PendingSubmitButton`'s actual prop names in `src/features/forms/pending-submit-button.tsx` before finishing (the invite panel uses `idleLabel`, `pendingLabel`, `statusText`, `variant`, `size`, `ariaLabel` — match whatever exists).

- [ ] **Step 5: Run the panel tests**

Run: `npm test -- src/features/env-vars/env-vars-panel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire into the app details page**

In `src/app/download/[requestId]/page.tsx`:

1. Add the import:

```tsx
import { EnvVarsPanel } from "@/features/env-vars/env-vars-panel";
```

2. In the `prisma.appRequest.findFirst` include block (after `publishSetupChecks`), add:

```ts
      environmentVariables: {
        orderBy: { key: "asc" },
      },
```

3. Immediately after the closing `</div>` of the "Azure Publishing" card (before the `canDeleteAppRequest` delete panel), render:

```tsx
        <EnvVarsPanel
          appRequestId={appRequest.id}
          envVars={appRequest.environmentVariables ?? []}
          isPublished={Boolean(appRequest.azureWebAppName)}
        />
```

(The `?? []` keeps existing page tests — whose mocked `findFirst` results lack the field — rendering.)

4. In `src/app/download/[requestId]/page.test.tsx`, add alongside the other module mocks:

```ts
vi.mock("@/features/env-vars/actions", () => ({
  saveEnvVarFormAction: vi.fn(),
  deleteEnvVarAction: vi.fn(),
}));
```

Then add one test to the `DownloadPage` describe block, following the file's existing pattern of mocking `prisma.appRequest.findFirst` (copy the nearest existing test's mock object and extend it):

```ts
it("shows the environment variables section with masked secrets", async () => {
  vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
    // ...copy the same base fields used by the first test in this file...
    environmentVariables: [
      { key: "API_KEY", isSecret: true, value: null, updatedAt: new Date() },
    ],
  } as never);

  render(await DownloadPage({ params: Promise.resolve({ requestId: "req_123" }) }));

  expect(screen.getByText("Environment Variables")).toBeInTheDocument();
  expect(screen.getByText("API_KEY")).toBeInTheDocument();
  expect(screen.getByText("••••••••")).toBeInTheDocument();
});
```

(Match the page component's actual props signature — check how the existing tests in that file call `DownloadPage` and mirror it exactly.)

- [ ] **Step 7: Run the page tests**

Run: `npm test -- "src/app/download/[requestId]/page.test.tsx"`
Expected: PASS (existing tests unaffected, new test passes).

- [ ] **Step 8: Commit**

```bash
git add src/features/env-vars/env-var-form.tsx src/features/env-vars/env-vars-panel.tsx src/features/env-vars/env-vars-panel.test.tsx "src/app/download/[requestId]/page.tsx" "src/app/download/[requestId]/page.test.tsx"
git commit -m "feat: add environment variables panel to app details screen

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: App deletion — remove the vault

**Files:**
- Modify: `src/features/app-deletion/external.ts`
- Modify: `src/features/app-deletion/actions.ts` (the `azureDeployment` object built at lines 260-272)
- Test: `src/features/app-deletion/external.test.ts` (new)

**Interfaces:**
- Consumes: `deleteKeyVault` ARM method (Task 4).
- Produces: `DeleteAzureDeploymentInput` gains `keyVaultName?: string | null`; `deleteAzureDeployment` deletes the vault when set.

- [ ] **Step 1: Write the failing test**

Create `src/features/app-deletion/external.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { deleteAzureDeployment } from "./external";

const config = {
  resourceGroup: "rg-cu-apps-published",
  postgresServer: "psql-cu-apps-published",
} as never;

function createArm() {
  return {
    deleteWebApp: vi.fn().mockResolvedValue(undefined),
    deletePostgresDatabase: vi.fn().mockResolvedValue(undefined),
    deleteKeyVault: vi.fn().mockResolvedValue(undefined),
  };
}

describe("deleteAzureDeployment", () => {
  it("deletes the key vault when the app has one", async () => {
    const arm = createArm();

    await deleteAzureDeployment(
      {
        resourceGroup: "rg-cu-apps-published",
        webAppName: "app-campus-dashboard-clx9abc1",
        postgresServer: "psql-cu-apps-published",
        databaseName: "db_campus_dashboard_clx9abc1",
        keyVaultName: "kv-campus-dashb-clx9abc1",
      },
      { config, arm },
    );

    expect(arm.deleteKeyVault).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      name: "kv-campus-dashb-clx9abc1",
    });
  });

  it("skips vault deletion when the app has no vault", async () => {
    const arm = createArm();

    await deleteAzureDeployment(
      {
        resourceGroup: "rg-cu-apps-published",
        webAppName: "app-campus-dashboard-clx9abc1",
        postgresServer: "psql-cu-apps-published",
        databaseName: null,
        keyVaultName: null,
      },
      { config, arm },
    );

    expect(arm.deleteKeyVault).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/features/app-deletion/external.test.ts`
Expected: FAIL — `keyVaultName` not accepted / `deleteKeyVault` missing from deps type.

- [ ] **Step 3: Implement**

In `src/features/app-deletion/external.ts`:

1. Add to `DeleteAzureDeploymentInput`:

```ts
  keyVaultName?: string | null;
```

2. Add to `AzureDeletionDeps["arm"]`:

```ts
    deleteKeyVault(input: {
      resourceGroup: string;
      name: string;
    }): Promise<void>;
```

3. At the end of `deleteAzureDeployment`, after the database deletion block:

```ts
  if (input.keyVaultName) {
    await deps.arm.deleteKeyVault({
      resourceGroup,
      name: input.keyVaultName,
    });
  }
```

In `src/features/app-deletion/actions.ts`, add to the `azureDeployment` object literal (lines 262-271):

```ts
      keyVaultName: appRequest.azureKeyVaultName ?? null,
```

If the `appRequest` value in scope doesn't select `azureKeyVaultName`, find its query/select in the same file and add the field.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/app-deletion/external.test.ts src/features/app-deletion/actions.test.ts`
Expected: PASS (if `actions.test.ts` asserts the exact `deleteAzureDeployment` argument, extend its expectation with `keyVaultName: null`).

- [ ] **Step 5: Commit**

```bash
git add src/features/app-deletion/external.ts src/features/app-deletion/external.test.ts src/features/app-deletion/actions.ts src/features/app-deletion/actions.test.ts
git commit -m "feat: delete the app key vault during azure deletion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Docs, full gate, and finish

**Files:**
- Modify: `docs/portal/setup.md`
- Modify: `docs/publishing/azure-app-service.md` (shared-resource list, lines 9-19)

- [ ] **Step 1: Document the Azure permissions in setup.md**

Add a section to `docs/portal/setup.md` (near the existing Azure publishing configuration docs):

```markdown
## Azure Permissions for App Env Vars and Secrets

User-managed environment variables store secret values in one Key Vault per
published app (`kv-{slug}-{shortRequestId}` in the publish resource group).
Secrets reach the running app through Key Vault references resolved by the
web app's system-assigned managed identity.

The portal's publishing service principal (`AZURE_PUBLISH_CLIENT_ID`) needs,
scoped to the publish resource group:

1. **Contributor** (already required for publishing) — creates/deletes
   vaults and enables web app managed identities.
2. **Key Vault Secrets Officer** — sets and deletes secret values in the
   RBAC-mode vaults.
3. **Role Based Access Control Administrator** — grants each web app's
   managed identity `Key Vault Secrets User` on its own vault. Constrain it
   with an ABAC condition so it can only assign that one role.

```bash
az role assignment create \
  --assignee "$AZURE_PUBLISH_CLIENT_ID" \
  --role "Key Vault Secrets Officer" \
  --scope "/subscriptions/$SUB_ID/resourceGroups/rg-cu-apps-published"

az role assignment create \
  --assignee "$AZURE_PUBLISH_CLIENT_ID" \
  --role "Role Based Access Control Administrator" \
  --scope "/subscriptions/$SUB_ID/resourceGroups/rg-cu-apps-published" \
  --condition "((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6})) AND ((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6}))" \
  --condition-version "2.0"
```

Deleted vaults soft-delete for 90 days; the portal never purges them.
```

(Adjust the placement and heading level to match the file's existing structure.)

- [ ] **Step 2: Update the shared-resource model list**

In `docs/publishing/azure-app-service.md`, extend the "Generated App Publishing" bullet list with:

```markdown
- one Azure Key Vault per published app that uses secret environment variables
```

- [ ] **Step 3: Full verification gate**

Run:
```bash
npm test
npm run build
```
Expected: both PASS. Fix anything that fails before proceeding.

- [ ] **Step 4: Commit**

```bash
git add docs/portal/setup.md docs/publishing/azure-app-service.md
git commit -m "docs: document azure permissions for app env vars and secrets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
