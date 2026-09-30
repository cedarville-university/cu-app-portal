import { randomUUID } from "node:crypto";
import type { TokenCredential } from "@azure/core-auth";
import { DefaultAzureCredential } from "@azure/identity";
import {
  ServiceBusClient,
  type ServiceBusSender,
} from "@azure/service-bus";
import {
  loadRepositoryImportTransportConfig,
  type RepositoryImportTransportConfig,
} from "./transport-config";
import { runRepositoryImportAttempt } from "./run-import-attempt";

export type RepositoryImportQueue = {
  send(input: { attemptId: string }): Promise<void>;
};

type ServiceBusClientBoundary = {
  createSender(queueName: string): Pick<
    ServiceBusSender,
    "sendMessages" | "close"
  >;
  close(): Promise<void>;
};

export type ServiceBusClientFactory = (
  fullyQualifiedNamespace: string,
  credential: TokenCredential,
) => ServiceBusClientBoundary;

export function createServiceBusRepositoryImportQueue(input: {
  fullyQualifiedNamespace: string;
  queueName: string;
  credential?: TokenCredential;
  clientFactory?: ServiceBusClientFactory;
}): RepositoryImportQueue {
  const clientFactory =
    input.clientFactory ??
    ((fullyQualifiedNamespace: string, credential: TokenCredential) =>
      new ServiceBusClient(fullyQualifiedNamespace, credential));

  return {
    async send({ attemptId }) {
      const credential = input.credential ?? new DefaultAzureCredential();
      const client = clientFactory(input.fullyQualifiedNamespace, credential);
      const sender = client.createSender(input.queueName);

      try {
        await sender.sendMessages({
          body: { attemptId },
          messageId: attemptId,
          contentType: "application/json",
        });
      } finally {
        try {
          await sender.close();
        } finally {
          await client.close();
        }
      }
    },
  };
}

export function createRepositoryImportQueue(input: {
  config?: RepositoryImportTransportConfig;
  runAttempt?: typeof runRepositoryImportAttempt;
  createExecutionName?: () => string;
} = {}): RepositoryImportQueue {
  const config = input.config ?? loadRepositoryImportTransportConfig();

  if (config.transport === "service-bus") {
    return createServiceBusRepositoryImportQueue(config);
  }

  if (config.transport === "disabled") {
    return {
      async send() {
        throw new Error("Repository import is currently unavailable.");
      },
    };
  }

  const runAttempt = input.runAttempt ?? runRepositoryImportAttempt;
  const createExecutionName =
    input.createExecutionName ?? (() => `inline-${randomUUID()}`);

  return {
    async send({ attemptId }) {
      await runAttempt({
        attemptId,
        workerExecutionName: createExecutionName(),
        deliveryCount: 1,
      });
    },
  };
}
