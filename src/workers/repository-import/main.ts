import { randomUUID } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import {
  ServiceBusClient,
  type ServiceBusReceiver,
} from "@azure/service-bus";
import {
  loadRepositoryImportTransportConfig,
  type RepositoryImportTransportConfig,
} from "@/features/repository-imports/transport-config";
import {
  processRepositoryImportMessage,
  type RepositoryImportMessageDeps,
} from "./message";

type ServiceBusWorkerClient = {
  createReceiver(
    queueName: string,
    options: { receiveMode: "peekLock" },
  ): Pick<ServiceBusReceiver, "receiveMessages" | "close"> &
    RepositoryImportMessageDeps["receiver"];
  close(): Promise<void>;
};

export type RepositoryImportWorkerDeps = {
  config?: RepositoryImportTransportConfig;
  createClient?: (
    fullyQualifiedNamespace: string,
  ) => ServiceBusWorkerClient;
  processMessage?: typeof processRepositoryImportMessage;
  workerExecutionName?: string;
  maxWaitTimeInMs?: number;
};

export async function runRepositoryImportWorker(
  deps: RepositoryImportWorkerDeps = {},
): Promise<"processed" | "idle"> {
  const config = deps.config ?? loadRepositoryImportTransportConfig();
  if (config.transport !== "service-bus") {
    throw new Error(
      "The repository import worker requires the service-bus transport.",
    );
  }

  const createClient =
    deps.createClient ??
    ((fullyQualifiedNamespace: string) =>
      new ServiceBusClient(
        fullyQualifiedNamespace,
        new DefaultAzureCredential(),
      ));
  const client = createClient(config.fullyQualifiedNamespace);
  const receiver = client.createReceiver(config.queueName, {
    receiveMode: "peekLock",
  });

  try {
    const messages = await receiver.receiveMessages(1, {
      maxWaitTimeInMs: deps.maxWaitTimeInMs ?? 10_000,
    });
    const message = messages[0];
    if (!message) return "idle";

    await (deps.processMessage ?? processRepositoryImportMessage)(message, {
      receiver,
      workerExecutionName:
        deps.workerExecutionName ??
        process.env.CONTAINER_APP_JOB_EXECUTION_NAME ??
        `local-${randomUUID()}`,
    });
    return "processed";
  } finally {
    try {
      await receiver.close();
    } finally {
      await client.close();
    }
  }
}

async function main() {
  await runRepositoryImportWorker();
}

if (
  process.argv[1]?.endsWith("src/workers/repository-import/main.ts") ||
  process.argv[1]?.endsWith("workers/repository-import/dist/main.js") ||
  process.argv[1]?.endsWith("/app/dist/main.js")
) {
  void main().catch((error) => {
    console.error(
      "Repository import worker failed.",
      error instanceof Error ? error.message : "Unknown failure.",
    );
    process.exitCode = 1;
  });
}
