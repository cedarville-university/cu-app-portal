import { describe, expect, it, vi } from "vitest";
import { PortalApiError } from "./errors";
import {
  executeIdempotentMutation,
  type PortalApiOperationRecord,
  type PortalApiOperationStore,
} from "./idempotency";
import { sha256StableJson } from "./stable-json";

const key = "53b6240b-2f6f-4ab8-bf70-3458b861bf3f";

class InMemoryOperationStore implements PortalApiOperationStore {
  private readonly records = new Map<string, PortalApiOperationRecord>();

  async deleteExpired(now: Date) {
    for (const [recordKey, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(recordKey);
    }
  }

  async find(actorUserId: string, operation: string, idempotencyKey: string) {
    return this.records.get(`${actorUserId}:${operation}:${idempotencyKey}`) ?? null;
  }

  async create(record: Omit<PortalApiOperationRecord, "id" | "createdAt" | "updatedAt">) {
    const recordKey = `${record.actorUserId}:${record.operation}:${record.idempotencyKey}`;
    if (this.records.has(recordKey)) {
      const error = new Error("unique violation") as Error & { code: string };
      error.code = "P2002";
      throw error;
    }

    const now = new Date();
    const created = { ...record, id: `op-${this.records.size + 1}`, createdAt: now, updatedAt: now };
    this.records.set(recordKey, created);
    return created;
  }

  async update(id: string, update: Pick<PortalApiOperationRecord, "state" | "safeResult" | "errorCode">) {
    const record = [...this.records.values()].find((candidate) => candidate.id === id);
    if (!record) throw new Error("missing record");
    Object.assign(record, update, { updatedAt: new Date() });
    return record;
  }

  async insertExpired(record: PortalApiOperationRecord) {
    this.records.set(`${record.actorUserId}:${record.operation}:${record.idempotencyKey}`, record);
  }

  all() {
    return [...this.records.values()];
  }
}

function mutationOptions(store: PortalApiOperationStore, overrides: Record<string, unknown> = {}) {
  return {
    actorUserId: "user-1",
    operation: "create_app",
    idempotencyKey: key,
    input: { appName: "Test" },
    expiresInSeconds: 604800,
    claimRateLimit: vi.fn(),
    execute: vi.fn().mockResolvedValue({ requestId: "req-1" }),
    store,
    ...overrides,
  };
}

describe("stable portal API input JSON", () => {
  it("hashes equivalent objects with different property order identically", async () => {
    await expect(sha256StableJson({ b: ["first", "second"], a: 1 })).resolves.toBe(
      await sha256StableJson({ a: 1, b: ["first", "second"] }),
    );
  });

  it("rejects values JSON cannot safely represent", async () => {
    await expect(sha256StableJson({ value: undefined })).rejects.toThrow("undefined");
    await expect(sha256StableJson({ value: Number.POSITIVE_INFINITY })).rejects.toThrow(
      "finite",
    );
  });
});

describe("executeIdempotentMutation", () => {
  it("replays a succeeded result for an identical key and canonical input", async () => {
    const store = new InMemoryOperationStore();
    const execute = vi.fn().mockResolvedValue({ requestId: "req-1" });
    const first = mutationOptions(store, { input: { b: "value", a: "Test" }, execute });

    await expect(executeIdempotentMutation(first)).resolves.toEqual({ requestId: "req-1" });
    await expect(
      executeIdempotentMutation({ ...first, input: { a: "Test", b: "value" } }),
    ).resolves.toEqual({ requestId: "req-1" });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(first.claimRateLimit).toHaveBeenCalledTimes(1);
  });

  it("rejects changed input under a reused key after consuming a mutation allowance", async () => {
    const store = new InMemoryOperationStore();
    await executeIdempotentMutation(mutationOptions(store));
    const changed = mutationOptions(store, { input: { appName: "Changed" } });

    await expect(executeIdempotentMutation(changed)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(changed.claimRateLimit).toHaveBeenCalledTimes(1);
    expect(changed.execute).not.toHaveBeenCalled();
  });

  it("keeps a pending claim with its first caller and rejects a duplicate", async () => {
    const store = new InMemoryOperationStore();
    let releaseFirst: ((result: { requestId: string }) => void) | undefined;
    const execute = vi.fn(
      () => new Promise<{ requestId: string }>((resolve) => { releaseFirst = resolve; }),
    );
    const first = mutationOptions(store, { execute });
    const firstRun = executeIdempotentMutation(first);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));

    const duplicate = mutationOptions(store);
    await expect(executeIdempotentMutation(duplicate)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(duplicate.claimRateLimit).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);

    releaseFirst?.({ requestId: "req-1" });
    await expect(firstRun).resolves.toEqual({ requestId: "req-1" });
  });

  it("persists and safely replays a failure", async () => {
    const store = new InMemoryOperationStore();
    const execute = vi.fn().mockRejectedValue(
      new PortalApiError("ACTION_REQUIRED", "Complete setup before publishing."),
    );
    const first = mutationOptions(store, { execute });

    await expect(executeIdempotentMutation(first)).rejects.toMatchObject({
      code: "ACTION_REQUIRED",
      message: "Complete setup before publishing.",
    });
    expect(store.all()[0]).toMatchObject({
      state: "FAILED",
      safeResult: {
        code: "ACTION_REQUIRED",
        message: "Complete setup before publishing.",
        retryAfterSeconds: null,
      },
    });

    await expect(executeIdempotentMutation({ ...first, execute: vi.fn() })).rejects.toMatchObject({
      code: "ACTION_REQUIRED",
      message: "Complete setup before publishing.",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("allows a key to be reused after its stored operation expires", async () => {
    const store = new InMemoryOperationStore();
    await store.insertExpired({
      id: "expired-op",
      actorUserId: "user-1",
      operation: "create_app",
      idempotencyKey: key,
      inputDigest: "old-digest",
      state: "SUCCEEDED",
      safeResult: { requestId: "old" },
      errorCode: null,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
      updatedAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    await expect(executeIdempotentMutation(mutationOptions(store))).resolves.toEqual({ requestId: "req-1" });
  });

  it("rejects an invalid idempotency key before mutation work", async () => {
    const store = new InMemoryOperationStore();
    const mutation = mutationOptions(store, { idempotencyKey: "not-a-uuid" });

    await expect(executeIdempotentMutation(mutation)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(mutation.claimRateLimit).not.toHaveBeenCalled();
    expect(mutation.execute).not.toHaveBeenCalled();
  });
});
