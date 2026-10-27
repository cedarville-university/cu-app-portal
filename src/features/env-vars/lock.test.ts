import { describe, expect, it, vi } from "vitest";
import { createEnvironmentLock, type EnvironmentLockDatabase } from "./lock";

describe("cross-instance environment mutation lock", () => {
  it("takes a per-app PostgreSQL advisory lock and uses the locked transaction for work", async () => {
    const order: string[] = [];
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const tx = {
      appRequest: {}, appEnvironmentVariable: {},
      $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => { order.push("lock"); queries.push({ text: strings.join("?"), values }); }),
    };
    const transaction = vi.fn(async (execute: (database: unknown) => Promise<unknown>) => {
      order.push("begin"); const result = await execute(tx); order.push("commit"); return result;
    });
    const lock = createEnvironmentLock({ $transaction: transaction } as unknown as EnvironmentLockDatabase);
    expect(await lock("app-1", async db => { expect(db).toBe(tx); order.push("work"); return "saved"; })).toBe("saved");
    expect(order).toEqual(["begin", "lock", "work", "commit"]);
    expect(queries).toEqual([{ text: expect.stringContaining("pg_advisory_xact_lock(hashtextextended(?"), values: ["app-environment:app-1"] }]);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 10_000, timeout: 120_000, isolationLevel: "ReadCommitted" });
  });
  it("does not run mutations if locking fails", async () => {
    const execute = vi.fn();
    const lock = createEnvironmentLock({ $transaction: async (fn: (db: unknown) => Promise<unknown>) => fn({ $executeRaw: async () => { throw new Error("lock unavailable"); } }) } as unknown as EnvironmentLockDatabase);
    await expect(lock("app-1", execute)).rejects.toThrow("lock unavailable");
    expect(execute).not.toHaveBeenCalled();
  });
});
