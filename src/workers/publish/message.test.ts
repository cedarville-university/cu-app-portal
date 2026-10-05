// @vitest-environment node
import { expect, it, vi } from "vitest";
import type { ServiceBusReceivedMessage } from "@azure/service-bus";
import { processPublishMessage } from "./message";
vi.mock("@/features/publishing/run-durable-attempt", () => ({ runDurablePublishAttempt: vi.fn() }));
function receiver() { return { completeMessage: vi.fn(), abandonMessage: vi.fn(), deadLetterMessage: vi.fn(), renewMessageLock: vi.fn().mockResolvedValue(undefined) }; }
it("dead letters malformed messages without starting a deployment", async () => {
  const r = receiver(); const run = vi.fn();
  await processPublishMessage({ body: { attemptId: "a", actorUserId: "spoofed" } } as ServiceBusReceivedMessage, r, run);
  expect(run).not.toHaveBeenCalled(); expect(r.deadLetterMessage).toHaveBeenCalled();
});
it("acknowledges only after the database attempt has settled", async () => {
  const r = receiver(); let settled = false;
  const run = vi.fn(async () => { expect(r.completeMessage).not.toHaveBeenCalled(); settled = true; });
  await processPublishMessage({ body: { attemptId: "attempt" }, deliveryCount: 1 } as ServiceBusReceivedMessage, r, run);
  expect(settled).toBe(true); expect(r.completeMessage).toHaveBeenCalledTimes(1);
});
it("allows broker redelivery when persistence fails", async () => {
  const r = receiver();
  await expect(processPublishMessage({ body: { attemptId: "attempt" }, deliveryCount: 1 } as ServiceBusReceivedMessage, r, vi.fn().mockRejectedValue(new Error("db down")))).rejects.toThrow("db down");
  expect(r.completeMessage).not.toHaveBeenCalled(); expect(r.abandonMessage).toHaveBeenCalledTimes(1);
});
