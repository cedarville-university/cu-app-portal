export type PublishTransportConfig =
  | { transport: "disabled" }
  | { transport: "database" }
  | { transport: "service-bus"; fullyQualifiedNamespace: string; queueName: string };

export function loadPublishTransportConfig(
  env: Record<string, string | undefined> = process.env,
): PublishTransportConfig {
  const transport = env.PUBLISH_TRANSPORT ?? (env.NODE_ENV === "production" ? "disabled" : "database");
  if (transport === "disabled") return { transport };
  if (transport === "database" && env.NODE_ENV !== "production") return { transport };
  if (transport !== "service-bus") {
    throw new Error("Publishing requires service-bus in production. Run the separate database worker for local development.");
  }
  const fullyQualifiedNamespace = env.PUBLISH_SERVICE_BUS_NAMESPACE?.trim() ?? "";
  const queueName = env.PUBLISH_SERVICE_BUS_QUEUE?.trim() ?? "";
  if (!/^[a-z0-9][a-z0-9-]*\.servicebus\.windows\.net$/i.test(fullyQualifiedNamespace) || !queueName) {
    throw new Error("PUBLISH_SERVICE_BUS_NAMESPACE and PUBLISH_SERVICE_BUS_QUEUE are required.");
  }
  return { transport, fullyQualifiedNamespace, queueName };
}
