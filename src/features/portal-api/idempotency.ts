import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PortalApiError, type PortalApiErrorCode, toSafePortalApiError } from "./errors";
import { sha256StableJson, stableJsonValue } from "./stable-json";

type PortalApiOperationState = "PENDING" | "SUCCEEDED" | "FAILED";

export type PortalApiOperationRecord = {
  id: string;
  actorUserId: string;
  operation: string;
  idempotencyKey: string;
  inputDigest: string;
  state: PortalApiOperationState;
  safeResult: Prisma.JsonValue | null;
  errorCode: string | null;
  appRequestId?: string | null;
  publishAttemptId?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export interface PortalApiOperationStore {
  deleteExpired(now: Date): Promise<void>;
  find(actorUserId: string, operation: string, idempotencyKey: string): Promise<PortalApiOperationRecord | null>;
  create(record: Omit<PortalApiOperationRecord, "id" | "createdAt" | "updatedAt">): Promise<PortalApiOperationRecord>;
  update(
    id: string,
    update: Pick<PortalApiOperationRecord, "state" | "safeResult" | "errorCode"> &
      Partial<Pick<PortalApiOperationRecord, "appRequestId" | "publishAttemptId">>,
  ): Promise<PortalApiOperationRecord>;
}

function toJsonInput(value: Prisma.JsonValue | null) {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

const defaultStore: PortalApiOperationStore = {
  async deleteExpired(now) {
    await prisma.portalApiOperation.deleteMany({ where: { expiresAt: { lte: now } } });
  },
  find(actorUserId, operation, idempotencyKey) {
    return prisma.portalApiOperation.findUnique({
      where: { actorUserId_operation_idempotencyKey: { actorUserId, operation, idempotencyKey } },
    });
  },
  create(record) {
    return prisma.portalApiOperation.create({
      data: { ...record, safeResult: toJsonInput(record.safeResult) },
    });
  },
  update(id, update) {
    return prisma.portalApiOperation.update({
      where: { id },
      data: { ...update, safeResult: toJsonInput(update.safeResult) },
    });
  },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function restoreFailedOperation(record: PortalApiOperationRecord): never {
  const safeResult = record.safeResult;
  if (
    safeResult &&
    typeof safeResult === "object" &&
    !Array.isArray(safeResult) &&
    typeof safeResult.code === "string" &&
    typeof safeResult.message === "string" &&
    (typeof safeResult.retryAfterSeconds === "number" || safeResult.retryAfterSeconds === null)
  ) {
    throw new PortalApiError(
      safeResult.code as PortalApiErrorCode,
      safeResult.message,
      safeResult.retryAfterSeconds,
    );
  }

  throw new PortalApiError(
    "PROVIDER_FAILURE",
    "The portal could not complete this operation.",
  );
}

async function resolveExisting<TResult>(
  record: PortalApiOperationRecord,
  inputDigest: string,
  claimRateLimit: () => Promise<void>,
  rateLimitAlreadyClaimed = false,
): Promise<TResult> {
  if (record.inputDigest !== inputDigest || record.state === "PENDING") {
    if (!rateLimitAlreadyClaimed) await claimRateLimit();
    throw new PortalApiError("CONFLICT", "This operation is already being processed or has changed.");
  }

  if (record.state === "FAILED") restoreFailedOperation(record);
  return record.safeResult as TResult;
}

export async function executeIdempotentMutation<TInput, TResult>(options: {
  actorUserId: string;
  operation: string;
  idempotencyKey: string;
  input: TInput;
  expiresInSeconds: number;
  claimRateLimit: () => Promise<void>;
  execute: () => Promise<TResult>;
  resultReferences?: (result: TResult) => {
    appRequestId?: string;
    publishAttemptId?: string;
  };
  store?: PortalApiOperationStore;
}): Promise<TResult> {
  if (!UUID_PATTERN.test(options.idempotencyKey)) {
    throw new PortalApiError("INVALID_INPUT", "A valid idempotency key is required.");
  }
  if (!Number.isInteger(options.expiresInSeconds) || options.expiresInSeconds <= 0) {
    throw new PortalApiError("INVALID_INPUT", "A valid operation expiry is required.");
  }

  const inputDigest = await sha256StableJson(options.input);
  const store = options.store ?? defaultStore;
  const now = new Date();
  await store.deleteExpired(now);

  const existing = await store.find(options.actorUserId, options.operation, options.idempotencyKey);
  if (existing) {
    return resolveExisting(existing, inputDigest, options.claimRateLimit);
  }

  await options.claimRateLimit();

  let record: PortalApiOperationRecord;
  try {
    record = await store.create({
      actorUserId: options.actorUserId,
      operation: options.operation,
      idempotencyKey: options.idempotencyKey,
      inputDigest,
      state: "PENDING",
      safeResult: null,
      errorCode: null,
      expiresAt: new Date(now.getTime() + options.expiresInSeconds * 1000),
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const racedRecord = await store.find(options.actorUserId, options.operation, options.idempotencyKey);
    if (!racedRecord) throw error;
    return resolveExisting(racedRecord, inputDigest, options.claimRateLimit, true);
  }

  let result: TResult;
  try {
    result = await options.execute();
  } catch (error) {
    const safeError = toSafePortalApiError(error);
    await store.update(record.id, {
      state: "FAILED",
      safeResult: safeError as Prisma.JsonValue,
      errorCode: safeError.code,
    });
    throw error instanceof PortalApiError
      ? error
      : new PortalApiError(safeError.code, safeError.message, safeError.retryAfterSeconds);
  }

  const safeResult = stableJsonValue(result) as Prisma.JsonValue;
  await store.update(record.id, {
    state: "SUCCEEDED",
    safeResult,
    errorCode: null,
    ...options.resultReferences?.(result),
  });
  return result;
}
