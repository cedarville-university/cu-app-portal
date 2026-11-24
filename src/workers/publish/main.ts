import { DefaultAzureCredential } from "@azure/identity";
import { ServiceBusClient } from "@azure/service-bus";
import { prisma } from "@/lib/db";
import { loadPublishTransportConfig } from "@/features/publishing/transport-config";
import { runDurablePublishAttempt } from "@/features/publishing/run-durable-attempt";
import { recoverStalePublishes } from "@/features/publishing/recovery";
import { checkDueAppHealth } from "@/features/publishing/app-health";
import { checkNightlySecurity } from "@/features/security-review/worker";
import { processPublishMessage } from "./message";

export async function runPublishWorker() {
  if (process.env.PUBLISH_WORKER_MODE === "recovery") {
    const result = await recoverStalePublishes();
    console.info("[publish-recovery]", result);
    const health = await checkDueAppHealth();
    console.info("[app-health]", health);
    const security = await checkNightlySecurity();
    if (security.scanned || security.unchanged || security.failed) console.info("[nightly-security]", security);
    if (result.errors || health.errors) throw new Error("Some publish attempts or app health checks could not be inspected.");
    return;
  }
  const config = loadPublishTransportConfig();
  if (config.transport === "disabled") throw new Error("The publish worker is disabled.");
  if (config.transport === "database") {
    let stopped = false;
    const stop = () => { stopped = true; };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    while (!stopped) {
      const now = new Date();
      const attempts = await prisma.publishAttempt.findMany({
        where: { OR: [
          { status: "QUEUED" },
          { status: "RUNNING", workerLeaseExpiresAt: { lte: now } },
          { status: "RUNNING", workerLeaseExpiresAt: null, createdAt: { lte: new Date(now.getTime() - 30 * 60_000) } },
        ] },
        orderBy: [{ workerHeartbeatAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
        take: 10,
      });
      for (const attempt of attempts) await runDurablePublishAttempt(attempt.id);
      await recoverStalePublishes();
      await checkDueAppHealth();
      await checkNightlySecurity();
      if (!stopped) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    return;
  }
  const client = new ServiceBusClient(config.fullyQualifiedNamespace, new DefaultAzureCredential());
  const receiver = client.createReceiver(config.queueName, { receiveMode: "peekLock" });
  try {
    const [message] = await receiver.receiveMessages(1, { maxWaitTimeInMs: 10_000 });
    if (!message) return;
    await processPublishMessage(message, receiver);
  } finally {
    try { await receiver.close(); } finally { await client.close(); }
  }
}

if (process.argv[1]?.endsWith("src/workers/publish/main.ts") || process.argv[1]?.endsWith("/dist/main.js")) {
  void runPublishWorker().catch((error) => {
    console.error("Publishing worker failed.", error instanceof Error ? error.message : "Unknown failure.");
    process.exitCode = 1;
  }).finally(() => prisma.$disconnect());
}
