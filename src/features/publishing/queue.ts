import { randomUUID } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { ServiceBusClient } from "@azure/service-bus";
import { loadPublishTransportConfig } from "./transport-config";

export type PublishQueue = { send(input: { attemptId: string }): Promise<void> };

export function createPublishQueue(): PublishQueue {
  const config = loadPublishTransportConfig();
  if (config.transport === "disabled") throw new Error("Publishing is currently unavailable. The durable publish worker must be configured.");
  if (config.transport === "database") return { async send() {} };
  return {
    async send({ attemptId }) {
      const client = new ServiceBusClient(config.fullyQualifiedNamespace, new DefaultAzureCredential());
      const sender = client.createSender(config.queueName);
      try {
        await sender.sendMessages({ body: { attemptId }, messageId: `${attemptId}-${randomUUID()}`, contentType: "application/json" });
      } finally {
        try { await sender.close(); } finally { await client.close(); }
      }
    },
  };
}
