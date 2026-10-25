// @vitest-environment node
import { expect, it, vi } from "vitest";
import { LogReadBudget } from "./http";
import { readAzureLogs } from "./azure";
it("returns deployment and runtime text with scoped requests and uncorrelated deployment labeling", async () => {
  const calls: Array<{
    url: string;
    method?: string;
  }> = [];
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    if (String(url).includes("containerlogs"))
      return new Response("Error runtime\npassword=hidden");
    if (String(url).includes("/log?"))
      return Response.json({ value: [{ message: "Build error token=hidden", log_time: "2026-10-25T10:00:00Z" }] });
    return Response.json({ value: [{ id: "d1", properties: { status: 3, start_time: "2026-10-25T10:00:00Z" } }] });
  });
  const budget = new LogReadBudget(fetchImpl as typeof fetch);
  const page = await readAzureLogs({
    subscription: "s", resourceGroup: "rg", webApp: "app"
  }, { maxLines: 200, logKind: "both" }, budget, async () => "azure-token");
  expect(page.entries).toHaveLength(2);
  expect(page.entries[0]).toMatchObject({
    deploymentId: "d1", correlation: "uncorrelated", status: "available"
  });
  expect(page.entries[1]).toMatchObject({ status: "available", text: "Error runtime\npassword=[redacted]" });
  expect(calls.every(c => c.url.startsWith("https://management.azure.com/subscriptions/s/resourceGroups/rg/providers/Microsoft.Web/sites/app/"))).toBe(true);
  expect(calls.map(c => c.method)).toEqual(["GET", "GET", "POST"]);
  budget.close();
});
it("keeps available deployment logs when runtime log access is forbidden", async () => {
  const fetchImpl = vi.fn(async (url) => String(url).includes("containerlogs") ? new Response("sensitive failure", { status: 403 }) : Response.json({ value: [] }));
  const budget = new LogReadBudget(fetchImpl as typeof fetch);
  const page = await readAzureLogs({
    subscription: "s", resourceGroup: "rg", webApp: "app"
  }, { maxLines: 200, logKind: "both" }, budget, async () => "token");
  expect(page.entries.map(e => e.status)).toEqual(["empty", "forbidden"]);
  expect(JSON.stringify(page)).not.toContain("sensitive failure");
  budget.close();
});
it("reports an unexpected deployment-log shape instead of claiming empty logs", async () => {
  const fetchImpl = vi.fn(async (url) => String(url).includes("/log?") ? Response.json({ unexpected: true }) : Response.json({ value: [{ id: "d1" }] }));
  const budget = new LogReadBudget(fetchImpl as typeof fetch);
  const result = await readAzureLogs({
    subscription: "s", resourceGroup: "rg", webApp: "app"
  }, { maxLines: 200, logKind: "deployment" }, budget, async () => "t");
  expect(result.entries[0].status).toBe("unavailable");
  budget.close();
});
it("finds latest deployments across pages and retrieves a pinned deployment directly", async () => {
  const base = "https://management.azure.com/subscriptions/s/resourceGroups/rg/providers/Microsoft.Web/sites/app";
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (url) => {
    urls.push(String(url));
    if (String(url).includes("/log?"))
      return Response.json([{ message: "one\ntwo\nthree" }]);
    if (String(url).includes("/deployments/new?"))
      return Response.json({ id: "new", properties: { start_time: "2026-10-25T11:00:00Z" } });
    if (String(url).includes("skip=2"))
      return Response.json({ value: [{ id: "new", properties: { start_time: "2026-10-25T11:00:00Z" } }] });
    return Response.json({ value: [{ id: "old", properties: { start_time: "2026-10-25T10:00:00Z" } }], nextLink: `${base}/deployments?api-version=2025-03-01&skip=2` });
  });
  const target = {
    subscription: "s", resourceGroup: "rg", webApp: "app"
  };
  const firstBudget = new LogReadBudget(fetchImpl as typeof fetch);
  const first = await readAzureLogs(target, { maxLines: 1, logKind: "deployment" }, firstBudget, async () => "t");
  expect(first.entries[0]).toMatchObject({
    deploymentId: "new", text: "one", truncated: true
  });
  firstBudget.close();
  urls.length = 0;
  const nextBudget = new LogReadBudget(fetchImpl as typeof fetch);
  const next = await readAzureLogs(target, {
    maxLines: 1, logKind: "deployment", position: first.next!
  }, nextBudget, async () => "t");
  expect(next.entries[0]).toMatchObject({ deploymentId: "new", text: "two" });
  expect(urls[0]).toBe(`${base}/deployments/new?api-version=2025-03-01`);
  nextBudget.close();
});
it("rejects a deployment next-page link outside the stored app scope", async () => {
  const fetchImpl = vi.fn(async () => Response.json({ value: [{ id: "d" }], nextLink: "https://management.azure.com/subscriptions/s/resourceGroups/rg/providers/Microsoft.Web/sites/foreign/deployments?api-version=2025-03-01" }));
  const budget = new LogReadBudget(fetchImpl as typeof fetch);
  const result = await readAzureLogs({
    subscription: "s", resourceGroup: "rg", webApp: "app"
  }, { maxLines: 200, logKind: "deployment" }, budget, async () => "t");
  expect(result.entries[0].status).toBe("unavailable");
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  budget.close();
});
