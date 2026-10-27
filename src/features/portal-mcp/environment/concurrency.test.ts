import { describe, expect, it, vi } from "vitest";
import { saveEnvironmentVariables, type EnvVarServiceDeps } from "@/features/env-vars/service";
import type { PortalActor } from "@/features/portal-api/principal";
import { setAppEnvironment, type EnvironmentDependencies } from "./service";

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("concurrent UI and MCP environment saves", () => {
  it.each(["SAVED", "saved"])("cannot replace or collide with a concurrently created secret (%s)", async key => {
    const entered = signal(); const finishSecret = signal();
    const app = { id: "app-1", appName: "Example", azureWebAppName: "example-app", azureKeyVaultName: "vault", azureKeyVaultUri: "https://vault.example.test" };
    const rows = new Map<string, { key: string; isSecret: boolean; value: string | null }>();
    const db = {
      appRequest: { findFirst: vi.fn().mockResolvedValue(app), update: vi.fn() },
      appEnvironmentVariable: {
        findMany: vi.fn(async () => [...rows.values()].map(row => ({ ...row }))),
        upsert: vi.fn(async (args: { create: { key: string; isSecret: boolean; value: string | null }; update: { isSecret: boolean; value: string | null } }) => {
          const row = rows.has(args.create.key) ? { key: args.create.key, ...args.update } : args.create;
          rows.set(row.key, row); return row;
        }), delete: vi.fn(),
      },
    };
    let tail = Promise.resolve();
    // Mimic the database's per-app lock; the production saver must use it for
    // both entry points, including validation and all provider/row mutations.
    async function withEnvironmentLock<T>(_appId: string, execute: (database: EnvVarServiceDeps["prisma"]) => Promise<T>) {
      const previous = tail; const release = signal(); tail = release.promise;
      await previous;
      try { return await execute(db as never); } finally { release.resolve(); }
    }
    let settings: Record<string, string> = {};
    const arm = {
      getAppSettings: vi.fn(async () => ({ exists: true, settings: { ...settings } })),
      putAppSettings: vi.fn(async (input: { settings: Record<string, string> }) => { settings = { ...input.settings }; }),
      putKeyVault: vi.fn(), ensureSystemAssignedIdentity: vi.fn().mockResolvedValue({ principalId: "principal" }), putRoleAssignment: vi.fn(), keyVaultId: vi.fn(),
    };
    const serviceDeps = {
      prisma: db as never, config: { resourceGroup: "rg", location: "eastus2", azureTenantId: "tenant" }, arm,
      withEnvironmentLock,
      createKeyVaultClient: () => ({ setSecret: async () => { entered.resolve(); await finishSecret.promise; }, deleteSecret: vi.fn() }),
    } as EnvVarServiceDeps;
    const uiSave = saveEnvironmentVariables(serviceDeps, { appRequest: app, changes: [{ operation: "set", key: "SAVED", value: "synthetic-secret", isSecret: true }] });
    await entered.promise;
    const actor: PortalActor = { userId: "owner", entraOid: "oid", displayName: "Owner", email: "owner@cedarville.edu", isAdmin: false };
    const deps: EnvironmentDependencies = { db: db as never, createEnvDeps: () => serviceDeps, audit: vi.fn() };
    const mcpSave = setAppEnvironment(actor, { appId: app.id, variables: [{ key, value: "ordinary-replacement" }], idempotencyKey: "00000000-0000-4000-8000-000000000001" }, deps);
    void mcpSave.catch(() => undefined);
    try {
      // Let the MCP call reach the locked saver while the UI secret is pending.
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(arm.putAppSettings).not.toHaveBeenCalled();
    } finally {
      finishSecret.resolve();
      await Promise.allSettled([uiSave, mcpSave]);
    }
    await expect(uiSave).resolves.toEqual([{ operation: "set", key: "SAVED", isSecret: true }]);
    await expect(mcpSave).rejects.toMatchObject({ code: "PROVIDER_FAILURE" });
    expect(rows.get("SAVED")).toMatchObject({ isSecret: true, value: null });
    expect(rows.size).toBe(1);
    expect(settings).toEqual({ SAVED: "@Microsoft.KeyVault(SecretUri=https://vault.example.test/secrets/SAVED)" });
    expect(arm.putAppSettings).toHaveBeenCalledTimes(1);
  });
});
