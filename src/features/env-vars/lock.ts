import type { PrismaClient } from "@prisma/client";

export type EnvironmentDatabase = Pick<PrismaClient, "appRequest" | "appEnvironmentVariable">;
type EnvironmentLockTransaction = EnvironmentDatabase & {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};
export type EnvironmentLockDatabase = {
  $transaction<T>(
    execute: (transaction: EnvironmentLockTransaction) => Promise<T>,
    options: { maxWait: number; timeout: number; isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};
export type EnvironmentLock = <T>(appId: string, execute: (database: EnvironmentDatabase) => Promise<T>) => Promise<T>;

export function createEnvironmentLock(db: EnvironmentLockDatabase): EnvironmentLock {
  return (appId, execute) => db.$transaction(async transaction => {
    // Every UI/MCP environment save uses this transaction-scoped lock. Validate
    // after acquiring it and keep it through provider and database changes.
    // READ COMMITTED makes reads after a wait observe the preceding save.
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`app-environment:${appId}`}, 0))
    `;
    return execute(transaction);
  }, { maxWait: 10_000, timeout: 120_000, isolationLevel: "ReadCommitted" });
}
