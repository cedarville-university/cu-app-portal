import { describe, expect, it, vi } from "vitest";
import type { EnvVarServiceDeps } from "@/features/env-vars/service";
import type { PortalActor } from "@/features/portal-api/principal";
import { getAppEnvironment, authorizeEnvironmentApp, setAppEnvironment, type EnvironmentDependencies } from "./service";

const actor: PortalActor = { userId: "owner", entraOid: "oid", email: "owner@cedarville.edu", displayName: "Owner", isAdmin: false };
const app = { id: "app-1", appName: "Example", azureWebAppName: "example-app", azureKeyVaultName: null, azureKeyVaultUri: null };
const updatedAt = new Date("2026-10-27T12:00:00Z");
const vars = [{ key: "APP_TITLE", value: "Campus", isSecret: false, updatedAt }, { key: "API_KEY", value: "misclassified-sensitive", isSecret: false, updatedAt }, { key: "SAVED", value: "must-never-return", isSecret: true, updatedAt }];
function fixture() {
  const db = {
    appRequest: { findFirst: vi.fn().mockResolvedValue(app), update: vi.fn() },
    appEnvironmentVariable: {
      findMany: vi.fn(async (args: { select?: { value?: boolean }; where?: { isSecret?: boolean; key?: { in: string[] } }; take?: number; skip?: number }) => {
        const rows = vars.filter(row => args.where?.isSecret === undefined || row.isSecret === args.where.isSecret).filter(row => !args.where?.key || args.where.key.in.includes(row.key));
        return rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length)).map(row => args.select?.value ? { key: row.key, value: row.value } : { key: row.key, isSecret: row.isSecret, updatedAt: row.updatedAt });
      }),
      upsert: vi.fn().mockResolvedValue({}), delete: vi.fn(),
    },
  };
  const arm = { getAppSettings: vi.fn().mockResolvedValue({ exists: true, settings: { NODE_ENV: "production", SAVED: "@Microsoft.KeyVault(SecretUri=https://example.test/secrets/saved)", UNRELATED: "keep" } }), putAppSettings: vi.fn().mockResolvedValue(undefined), putKeyVault: vi.fn(), ensureSystemAssignedIdentity: vi.fn(), putRoleAssignment: vi.fn(), keyVaultId: vi.fn() };
  const createKeyVaultClient = vi.fn();
  const createEnvDeps = vi.fn(() => ({ prisma: db as never, withEnvironmentLock: async <T>(_appId: string, execute: (database: EnvVarServiceDeps["prisma"]) => Promise<T>) => execute(db as never), config: { resourceGroup: "rg", location: "eastus2", azureTenantId: "tenant" }, arm, createKeyVaultClient }));
  const audit = vi.fn().mockResolvedValue(undefined);
  const deps: EnvironmentDependencies = { db: db as never, createEnvDeps, audit };
  return { deps, db, arm, createEnvDeps, createKeyVaultClient, audit };
}
const write = { appId: "app-1", variables: [{ key: "FEATURE_FLAG", value: "on" }, { key: "APP_TITLE", value: "New title" }], idempotencyKey: "00000000-0000-4000-8000-000000000001" };

describe("actor-aware environment services", () => {
  it.each([false, true])("uses existing actor-specific access filter (admin=%s)", async isAdmin => {
    const f = fixture();
    await authorizeEnvironmentApp({ ...actor, isAdmin }, "app-1", f.deps.db);
    expect(f.db.appRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: isAdmin ? { id: "app-1" } : { id: "app-1", OR: [{ userId: "owner" }, { collaborators: { some: { userId: "owner" } } }] } }));
  });
  it("does not read any variables or configure providers after quiet denial", async () => {
    const f = fixture(); f.db.appRequest.findFirst.mockResolvedValue(null);
    await expect(getAppEnvironment(actor, { appId: "app-1" }, f.deps)).rejects.toMatchObject({ code: "NOT_FOUND", message: "App not found." });
    await expect(setAppEnvironment(actor, write, f.deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.db.appEnvironmentVariable.findMany).not.toHaveBeenCalled(); expect(f.createEnvDeps).not.toHaveBeenCalled();
  });
  it("reads only metadata for secrets and withholds sensitive ordinary settings", async () => {
    const f = fixture();
    const result = await getAppEnvironment(actor, { appId: "app-1" }, f.deps);
    expect(result.variables).toEqual([
      { key: "APP_TITLE", isSecret: false, updatedAt: updatedAt.toISOString(), valueStatus: "available", value: "Campus" },
      { key: "API_KEY", isSecret: false, updatedAt: updatedAt.toISOString(), valueStatus: "withheld" },
      { key: "SAVED", isSecret: true, updatedAt: updatedAt.toISOString(), valueStatus: "secret" },
    ]);
    const queries = f.db.appEnvironmentVariable.findMany.mock.calls;
    expect(queries[0][0].select).not.toHaveProperty("value");
    expect(queries[1][0].where).toMatchObject({ isSecret: false, key: { in: ["APP_TITLE"] } });
    expect(JSON.stringify(result)).not.toMatch(/must-never-return|misclassified-sensitive/);
    expect(f.createEnvDeps).not.toHaveBeenCalled();
  });
  it("withholds an entire ordinary value containing recognizable credentials", async () => {
    const f = fixture();
    f.db.appEnvironmentVariable.findMany.mockResolvedValueOnce([{ key: "LINK", isSecret: false, updatedAt }]).mockResolvedValueOnce([{ key: "LINK", value: "https://user:synthetic-pass@example.test" }]);
    expect((await getAppEnvironment(actor, { appId: "app-1" }, f.deps)).variables[0]).toEqual({ key: "LINK", isSecret: false, updatedAt: updatedAt.toISOString(), valueStatus: "withheld" });
  });
  it.each([
    "Basic c3ludGhldGljOnBhc3N3b3Jk",
    "Endpoint=sb://example.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=synthetic-value",
    '{"credential":"synthetic-value"}',
    '{"pwd":"synthetic-value"}',
  ])("withholds and rejects recognizable credential formats in an ordinary setting %#", async value => {
    const f = fixture();
    f.db.appEnvironmentVariable.findMany.mockResolvedValueOnce([{ key: "SERVICE_CONFIG", isSecret: false, updatedAt }]).mockResolvedValueOnce([{ key: "SERVICE_CONFIG", value }]);
    const result = await getAppEnvironment(actor, { appId: "app-1" }, f.deps);
    expect(result.variables[0]).toMatchObject({ valueStatus: "withheld" });
    expect(result.variables[0]).not.toHaveProperty("value");
    expect(JSON.stringify(result)).not.toContain(value);
    await expect(setAppEnvironment(actor, { ...write, variables: [{ key: "SERVICE_CONFIG", value }] }, f.deps)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.createEnvDeps).not.toHaveBeenCalled();
  });
  it("withholds a value if the row disappeared or became secret between reads", async () => {
    const f = fixture(); f.db.appEnvironmentVariable.findMany.mockResolvedValueOnce([{ key: "APP_TITLE", isSecret: false, updatedAt }]).mockResolvedValueOnce([]);
    expect((await getAppEnvironment(actor, { appId: "app-1" }, f.deps)).variables[0]).not.toHaveProperty("value");
  });
  it("uses a bounded, deterministic page and does not load off-page values", async () => {
    const f = fixture(); const result = await getAppEnvironment(actor, { appId: "app-1", limit: 1, offset: 0 }, f.deps);
    expect(result.nextOffset).toBe(1); expect(result.variables).toHaveLength(1);
    expect(f.db.appEnvironmentVariable.findMany.mock.calls[0][0]).toMatchObject({ take: 2, skip: 0, orderBy: [{ key: "asc" }, { id: "asc" }] });
  });
  it("updates a batch with one Azure write and preserves unrelated settings and secret references", async () => {
    const f = fixture(); const result = await setAppEnvironment(actor, write, f.deps);
    expect(f.arm.putAppSettings).toHaveBeenCalledTimes(1);
    expect(f.arm.putAppSettings).toHaveBeenCalledWith({ resourceGroup: "rg", name: "example-app", settings: { NODE_ENV: "production", UNRELATED: "keep", SAVED: "@Microsoft.KeyVault(SecretUri=https://example.test/secrets/saved)", FEATURE_FLAG: "on", APP_TITLE: "New title" } });
    expect(f.createKeyVaultClient).not.toHaveBeenCalled(); expect(f.arm.putKeyVault).not.toHaveBeenCalled();
    expect(f.db.appEnvironmentVariable.upsert).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ appId: "app-1", keys: ["FEATURE_FLAG", "APP_TITLE"], application: "live_settings_update" });
    expect(f.audit).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(f.audit.mock.calls)).not.toMatch(/New title|"on"/);
    expect(f.audit).toHaveBeenCalledWith("ENV_VAR_SET", { actorUserId: "owner", requestId: "app-1", key: "APP_TITLE", isSecret: false, source: "codex-mcp" });
  });
  it("saves unpublished settings without Azure calls", async () => {
    const f = fixture(); f.db.appRequest.findFirst.mockResolvedValue({ ...app, azureWebAppName: null });
    expect((await setAppEnvironment(actor, write, f.deps)).application).toBe("next_publish");
    expect(f.arm.getAppSettings).not.toHaveBeenCalled(); expect(f.arm.putAppSettings).not.toHaveBeenCalled();
  });
  it.each([
    [{ key: "FEATURE_FLAG", value: "on" }, { key: "apiKey", value: "synthetic" }],
    [{ key: "FEATURE_FLAG", value: "on" }, { key: "LINK", value: "Bearer synthetic-sensitive" }],
    [{ key: "FEATURE_FLAG", value: "on" }, { key: "DATABASE_URL", value: "nope" }],
    [{ key: "FEATURE_FLAG", value: "on" }, { key: "feature_flag", value: "off" }],
    [{ key: "SAVED", value: "replacement" }],
    [{ key: "saved", value: "replacement" }],
    [{ key: "__proto__", value: "blocked" }],
  ].map(variables => ({ variables })))("rejects an invalid batch before any provider or database mutation %#", async ({ variables }) => {
    const f = fixture();
    await expect(setAppEnvironment(actor, { ...write, variables }, f.deps)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.createEnvDeps).not.toHaveBeenCalled(); expect(f.db.appEnvironmentVariable.upsert).not.toHaveBeenCalled(); expect(f.audit).not.toHaveBeenCalled();
  });
  it("does not leak upstream errors containing submitted or provider values", async () => {
    const f = fixture(); f.arm.putAppSettings.mockRejectedValue(new Error("provider echoed New title and synthetic-sensitive-value"));
    await expect(setAppEnvironment(actor, write, f.deps)).rejects.toMatchObject({ code: "PROVIDER_FAILURE", message: expect.not.stringMatching(/New title|synthetic-sensitive-value/) });
    expect(f.audit).not.toHaveBeenCalled();
  });
  it.each([[], Array.from({ length: 101 }, (_, i) => ({ key: `FLAG_${i}`, value: "on" }))].map(variables => ({ variables })))("rejects batch bounds before touching providers %#", async ({ variables }) => {
    const f = fixture(); await expect(setAppEnvironment(actor, { ...write, variables }, f.deps)).rejects.toMatchObject({ code: "INVALID_INPUT" }); expect(f.createEnvDeps).not.toHaveBeenCalled();
  });
});
