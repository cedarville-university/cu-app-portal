// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { runRepositoryImportWorker } from "./main";

function createDeps(messages: unknown[]) {
  const receiver = {
    receiveMessages: vi.fn().mockResolvedValue(messages),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const client = {
    createReceiver: vi.fn().mockReturnValue(receiver),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    deps: {
      config: {
        transport: "service-bus" as const,
        fullyQualifiedNamespace: "imports.servicebus.windows.net",
        queueName: "repository-imports",
      },
      createClient: vi.fn().mockReturnValue(client),
      processMessage: vi.fn().mockResolvedValue(undefined),
      workerExecutionName: "execution-1",
    },
    client,
    receiver,
  };
}

describe("repository import worker entry point", () => {
  it("exits idle after an empty receive and closes resources", async () => {
    const setup = createDeps([]);
    await expect(runRepositoryImportWorker(setup.deps as never)).resolves.toBe("idle");
    expect(setup.receiver.close).toHaveBeenCalledOnce();
    expect(setup.client.close).toHaveBeenCalledOnce();
  });

  it("processes one message and closes resources before returning success", async () => {
    const message = { body: { attemptId: "attempt-1" } };
    const setup = createDeps([message]);
    await expect(runRepositoryImportWorker(setup.deps as never)).resolves.toBe(
      "processed",
    );
    expect(setup.deps.processMessage).toHaveBeenCalledWith(
      message,
      expect.objectContaining({
        receiver: setup.receiver,
        workerExecutionName: "execution-1",
      }),
    );
    expect(setup.receiver.close.mock.invocationCallOrder[0]).toBeLessThan(
      setup.client.close.mock.invocationCallOrder[0],
    );
  });
});
