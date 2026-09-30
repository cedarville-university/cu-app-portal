// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  createRepositoryImportQueue,
  createServiceBusRepositoryImportQueue,
} from "./queue";

function createServiceBusFakes() {
  const sender = {
    sendMessages: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const client = {
    createSender: vi.fn().mockReturnValue(sender),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const clientFactory = vi.fn().mockReturnValue(client);

  return { sender, client, clientFactory };
}

describe("repository import queue", () => {
  it("sends one JSON message containing only the attempt id", async () => {
    const { sender, client, clientFactory } = createServiceBusFakes();
    const credential = { getToken: vi.fn() };
    const queue = createServiceBusRepositoryImportQueue({
      fullyQualifiedNamespace: "cu-imports.servicebus.windows.net",
      queueName: "repository-imports",
      credential: credential as never,
      clientFactory,
    });

    await queue.send({ attemptId: "attempt-123" });

    expect(clientFactory).toHaveBeenCalledWith(
      "cu-imports.servicebus.windows.net",
      credential,
    );
    expect(client.createSender).toHaveBeenCalledWith("repository-imports");
    expect(sender.sendMessages).toHaveBeenCalledTimes(1);
    expect(sender.sendMessages).toHaveBeenCalledWith({
      body: { attemptId: "attempt-123" },
      messageId: "attempt-123",
      contentType: "application/json",
    });
    expect(sender.close).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("closes the sender and client when sending fails", async () => {
    const { sender, client, clientFactory } = createServiceBusFakes();
    sender.sendMessages.mockRejectedValueOnce(new Error("send failed"));
    const queue = createServiceBusRepositoryImportQueue({
      fullyQualifiedNamespace: "cu-imports.servicebus.windows.net",
      queueName: "repository-imports",
      credential: { getToken: vi.fn() } as never,
      clientFactory,
    });

    await expect(queue.send({ attemptId: "attempt-123" })).rejects.toThrow(
      "send failed",
    );
    expect(sender.close).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("returns a plain unavailable error when the transport is disabled", async () => {
    const queue = createRepositoryImportQueue({
      config: { transport: "disabled" },
    });

    await expect(queue.send({ attemptId: "attempt-123" })).rejects.toThrow(
      "Repository import is currently unavailable.",
    );
  });
});
