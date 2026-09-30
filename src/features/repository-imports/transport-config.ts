import { z } from "zod";

export type RepositoryImportTransportConfig =
  | { transport: "disabled" }
  | { transport: "inline" }
  | {
      transport: "service-bus";
      fullyQualifiedNamespace: string;
      queueName: string;
    };

const serviceBusNamespaceSchema = z
  .string({
    required_error:
      "REPOSITORY_IMPORT_SERVICE_BUS_NAMESPACE is required.",
  })
  .trim()
  .regex(
    /^[a-z0-9][a-z0-9-]*\.servicebus\.windows\.net$/i,
    "REPOSITORY_IMPORT_SERVICE_BUS_NAMESPACE must be a fully qualified Service Bus namespace.",
  );

export function loadRepositoryImportTransportConfig(
  source: Record<string, string | undefined> = process.env,
  nodeEnv = process.env.NODE_ENV,
): RepositoryImportTransportConfig {
  const defaultTransport = nodeEnv === "production" ? "disabled" : "inline";
  const transport = source.REPOSITORY_IMPORT_TRANSPORT?.trim() || defaultTransport;

  if (transport === "disabled") {
    return { transport };
  }

  if (transport === "inline") {
    if (nodeEnv === "production") {
      throw new Error(
        "Inline repository imports are not allowed in production. Use service-bus or disabled.",
      );
    }

    return { transport };
  }

  if (transport === "service-bus") {
    const fullyQualifiedNamespace = serviceBusNamespaceSchema.parse(
      source.REPOSITORY_IMPORT_SERVICE_BUS_NAMESPACE,
    );
    const queueName = z
      .string({
        required_error: "REPOSITORY_IMPORT_SERVICE_BUS_QUEUE is required.",
      })
      .trim()
      .min(1, "REPOSITORY_IMPORT_SERVICE_BUS_QUEUE is required.")
      .parse(source.REPOSITORY_IMPORT_SERVICE_BUS_QUEUE);

    return { transport, fullyQualifiedNamespace, queueName };
  }

  throw new Error(
    "REPOSITORY_IMPORT_TRANSPORT must be disabled, inline, or service-bus.",
  );
}
