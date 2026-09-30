// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  parseRepositoryImportMessage,
  processRepositoryImportMessage,
} from "./message";

function createDeps(result: unknown, deliveryCount = 1) {
  const receiver = {
    completeMessage: vi.fn().mockResolvedValue(undefined),
    abandonMessage: vi.fn().mockResolvedValue(undefined),
    deadLetterMessage: vi.fn().mockResolvedValue(undefined),
    renewMessageLock: vi.fn().mockResolvedValue(undefined),
  };
  return {
    message: { body: { attemptId: "attempt-1" }, deliveryCount } as never,
    deps: {
      receiver,
      runAttempt: vi.fn().mockResolvedValue(result),
      workerExecutionName: "execution-1",
      lockRenewalIntervalMs: 10,
    },
    receiver,
  };
}

describe("repository import worker messages", () => {
  it.each([
    null,
    "attempt-1",
    {},
    { attemptId: "" },
    { attemptId: "   " },
    { attemptId: "attempt-1", extra: true },
  ])("rejects malformed body %#", (body) => {
    expect(() => parseRepositoryImportMessage(body)).toThrow(
      "Invalid repository import message.",
    );
  });

  it("accepts only one non-empty attempt id", () => {
    expect(parseRepositoryImportMessage({ attemptId: "attempt-1" })).toEqual({
      attemptId: "attempt-1",
    });
  });

  it("dead-letters malformed bodies without logging body content", async () => {
    const { deps, receiver } = createDeps({ disposition: "complete" });
    const log = vi.fn();

    await processRepositoryImportMessage(
      { body: { token: "secret-value" }, deliveryCount: 1 } as never,
      { ...deps, log },
    );

    expect(receiver.deadLetterMessage).toHaveBeenCalledOnce();
    expect(deps.runAttempt).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-value");
  });

  it.each(["succeeded", "already-terminal"] as const)(
    "completes a %s result",
    async (result) => {
      const setup = createDeps({ disposition: "complete", result });
      await processRepositoryImportMessage(setup.message, setup.deps);
      expect(setup.receiver.completeMessage).toHaveBeenCalledWith(setup.message);
    },
  );

  it("abandons a transient result before delivery five", async () => {
    const setup = createDeps({ disposition: "abandon", errorSummary: "retry" }, 4);
    await processRepositoryImportMessage(setup.message, setup.deps);
    expect(setup.receiver.abandonMessage).toHaveBeenCalledWith(setup.message);
  });

  it("dead-letters a transient result at delivery five", async () => {
    const setup = createDeps({ disposition: "abandon", errorSummary: "retry" }, 5);
    await processRepositoryImportMessage(setup.message, setup.deps);
    expect(setup.receiver.deadLetterMessage).toHaveBeenCalledWith(
      setup.message,
      expect.objectContaining({ deadLetterReason: "MaxDeliveryCountExceeded" }),
    );
  });

  it("dead-letters terminal runner results", async () => {
    const setup = createDeps({ disposition: "dead-letter", errorSummary: "failed" });
    await processRepositoryImportMessage(setup.message, setup.deps);
    expect(setup.receiver.deadLetterMessage).toHaveBeenCalledWith(
      setup.message,
      expect.objectContaining({ deadLetterReason: "RepositoryImportFailed" }),
    );
  });

  it("renews the broker lock while provider work remains active", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const setup = createDeps(undefined);
    setup.deps.runAttempt = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const processing = processRepositoryImportMessage(setup.message, setup.deps);
    await vi.advanceTimersByTimeAsync(11);
    expect(setup.receiver.renewMessageLock).toHaveBeenCalledWith(setup.message);
    finish({ disposition: "complete", result: "succeeded" });
    await processing;
    vi.useRealTimers();
  });
});
