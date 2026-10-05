import type { ServiceBusReceivedMessage, ServiceBusReceiver } from "@azure/service-bus";
import { runDurablePublishAttempt } from "@/features/publishing/run-durable-attempt";

export function parsePublishMessage(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("attemptId" in body) || typeof body.attemptId !== "string" || !body.attemptId.trim()) throw new Error("Invalid publishing message.");
  return body.attemptId.trim();
}
export async function processPublishMessage(
  message: ServiceBusReceivedMessage,
  receiver: Pick<ServiceBusReceiver, "completeMessage" | "abandonMessage" | "deadLetterMessage" | "renewMessageLock">,
  runAttempt = runDurablePublishAttempt,
) {
  let attemptId: string;
  try { attemptId = parsePublishMessage(message.body); }
  catch {
    await receiver.deadLetterMessage(message, { deadLetterReason: "InvalidMessage", deadLetterErrorDescription: "Invalid publishing message." });
    return;
  }
  const renewal = setInterval(() => { void receiver.renewMessageLock(message).catch(() => { console.error("Publish message lock renewal failed.", { attemptId }); }); }, 20_000);
  try {
    await runAttempt(attemptId);
    await receiver.completeMessage(message);
  } catch (error) {
    if ((message.deliveryCount ?? 1) >= 5) {
      await receiver.deadLetterMessage(message, { deadLetterReason: "PublishWorkerFailure", deadLetterErrorDescription: "Publishing worker could not settle the attempt. Scheduled recovery will inspect it." });
    } else await receiver.abandonMessage(message);
    throw error;
  } finally { clearInterval(renewal); }
}
