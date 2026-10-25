// @vitest-environment node
import { expect, it, vi } from "vitest";
import { LogReadBudget, clipLogText } from "./http";
it("cancels oversized streams while enforcing aggregate bytes", async () => {
  let cancelled = false;
  const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } })));
  const budget = new LogReadBudget(fetchImpl as typeof fetch, { responseBytes: 1500, totalBytes: 2000 });
  await expect(budget.request("https://api.github.com/test")).rejects.toMatchObject({ status: "unavailable" });
  expect(cancelled).toBe(true);
  budget.close();
});
it("times out a stalled token, fetch, or body even when the dependency ignores abort", async () => {
  vi.useFakeTimers();
  for (const phase of ["token", "fetch", "body"]) {
    const never = () => new Promise<never>(() => { });
    const fetchImpl = phase === "fetch" ? never : async () => phase === "body" ? new Response(new ReadableStream({ start() { } })) : new Response("ok");
    const budget = new LogReadBudget(fetchImpl as typeof fetch, { requestMs: 20, overallMs: 100 });
    const result = budget.request("https://api.github.com/test", {}, phase === "token" ? never : undefined).catch(e => e);
    await vi.advanceTimersByTimeAsync(25);
    expect(await result).toMatchObject({ status: "unavailable" });
    budget.close();
  }
  vi.useRealTimers();
});
it("clips redacted UTF-8 log output by bytes and lines", () => {
  expect(clipLogText("token=hidden\nError 🐝\ntrace", 0, 2, 100)).toMatchObject({
    text: "token=[redacted]\nError 🐝", nextLine: 2, truncated: true
  });
  const clipped = clipLogText("🐝🐝🐝", 0, 10, 5);
  expect(Buffer.byteLength(clipped.text)).toBeLessThanOrEqual(5);
  expect(clipped.text).not.toContain("�");
});
it("enforces total output and download budgets across responses", async () => {
  const budget = new LogReadBudget(async () => new Response("1234"), { totalBytes: 6 });
  await budget.request("https://api.github.com/one");
  await expect(budget.request("https://api.github.com/two")).rejects.toMatchObject({ status: "unavailable" });
  const one = budget.excerpt("a".repeat(64000), 0, 1000);
  const two = budget.excerpt("b".repeat(64000), 0, 1000);
  expect(Buffer.byteLength(one.text) + Buffer.byteLength(two.text)).toBe(65536);
  expect(two.truncated).toBe(true);
  budget.close();
});
