import type {
  ServiceBusReceivedMessage,
  ServiceBusReceiver,
} from "@azure/service-bus";
import {
  runRepositoryImportAttempt,
  type RepositoryImportRunResult,
} from "@/features/repository-imports/run-import-attempt";

const MAX_DELIVERY_COUNT = 5;
const DEFAULT_LOCK_RENEWAL_INTERVAL_MS = 20_000;

export type RepositoryImportMessageDeps = {
  receiver: Pick<
    ServiceBusReceiver,
    | "completeMessage"
    | "abandonMessage"
    | "deadLetterMessage"
    | "renewMessageLock"
  >;
  runAttempt?: typeof runRepositoryImportAttempt;
  workerExecutionName: string;
  lockRenewalIntervalMs?: number;
  log?: (event: string, details: Record<string, unknown>) => void;
};

export function parseRepositoryImportMessage(body: unknown): {
  attemptId: string;
} {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("attemptId" in body) ||
    typeof body.attemptId !== "string" ||
    body.attemptId.trim().length === 0
  ) {
    throw new Error("Invalid repository import message.");
  }

  return { attemptId: body.attemptId.trim() };
}

export async function processRepositoryImportMessage(
  message: ServiceBusReceivedMessage,
  deps: RepositoryImportMessageDeps,
): Promise<void> {
  let parsed: { attemptId: string };
  try {
    parsed = parseRepositoryImportMessage(message.body);
  } catch {
    deps.log?.("invalid-message", {
      deliveryCount: message.deliveryCount ?? 0,
    });
    await deps.receiver.deadLetterMessage(message, {
      deadLetterReason: "InvalidMessage",
      deadLetterErrorDescription: "Invalid repository import message.",
    });
    return;
  }

  const runAttempt = deps.runAttempt ?? runRepositoryImportAttempt;
  const interval = setInterval(() => {
    void deps.receiver.renewMessageLock(message).catch(() => {
      deps.log?.("lock-renewal-failed", {
        attemptId: parsed.attemptId,
        deliveryCount: message.deliveryCount ?? 0,
      });
    });
  }, deps.lockRenewalIntervalMs ?? DEFAULT_LOCK_RENEWAL_INTERVAL_MS);

  let result: RepositoryImportRunResult;
  try {
    result = await runAttempt({
      attemptId: parsed.attemptId,
      workerExecutionName: deps.workerExecutionName,
      deliveryCount: message.deliveryCount ?? 1,
    });
  } finally {
    clearInterval(interval);
  }

  await settleMessage(message, result, deps);
}

async function settleMessage(
  message: ServiceBusReceivedMessage,
  result: RepositoryImportRunResult,
  deps: RepositoryImportMessageDeps,
) {
  if (result.disposition === "complete") {
    await deps.receiver.completeMessage(message);
    return;
  }

  if (
    result.disposition === "abandon" &&
    (message.deliveryCount ?? 1) < MAX_DELIVERY_COUNT
  ) {
    await deps.receiver.abandonMessage(message);
    return;
  }

  await deps.receiver.deadLetterMessage(message, {
    deadLetterReason:
      result.disposition === "abandon"
        ? "MaxDeliveryCountExceeded"
        : "RepositoryImportFailed",
    deadLetterErrorDescription: result.errorSummary,
  });
}
