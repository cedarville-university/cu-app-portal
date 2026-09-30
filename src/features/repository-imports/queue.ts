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

  return {
    async send() {
      throw new Error("Inline repository import execution is not configured.");
    },
  };
}
