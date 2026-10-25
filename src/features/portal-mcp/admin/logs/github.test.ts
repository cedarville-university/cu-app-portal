// @vitest-environment node
import { expect, it, vi } from "vitest";
import { LogReadBudget } from "./http";
import { readGitHubLogs } from "./github";
it("prioritizes failures, authenticates provider reads, and strips authorization from signed downloads", async () => {
  const calls: Array<{
    url: string;
    auth: string | null;
  }> = [];
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get("Authorization") });
    if (String(url).includes("/jobs?"))
      return Response.json({ total_count: 2, jobs: [{
            id: 1, name: "success", conclusion: "success", status: "completed"
          }, {
            id: 2, name: "failed", conclusion: "failure", status: "completed"
          }] });
    if (String(url).includes("/logs"))
      return new Response(null, { status: 302, headers: { Location: "https://productionresults1.blob.core.windows.net/log?sig=private" } });
    return new Response("Error: password=hidden\n at main.ts:1");
  });
  const budget = new LogReadBudget(fetchImpl as typeof fetch);
  const page = await readGitHubLogs({
    owner: "org", repo: "repo", runId: "10"
  }, { maxLines: 200 }, budget, async () => "private-token");
  expect(page.entries[0]).toMatchObject({
    status: "available", jobId: "2", text: "Error: password=[redacted]\n at main.ts:1"
  });
  expect(calls.filter(c => c.url.includes("blob.core")).every(c => c.auth === null)).toBe(true);
  expect(calls.filter(c => c.url.includes("api.github")).every(c => c.auth === "Bearer private-token")).toBe(true);
  expect(JSON.stringify(page)).not.toContain("sig=private");
  budget.close();
});
it("rejects hostile redirect destinations and reports pending logs", async () => {
  for (const [location, status] of [["http://localhost/log", "unavailable"], ["https://169.254.169.254/log", "unavailable"], ["https://evil.test/log", "unavailable"]]) {
    const fetchImpl = vi.fn(async (url) => String(url).includes("/jobs?") ? Response.json({ total_count: 1, jobs: [{
          id: 1, status: "completed", conclusion: "failure"
        }] }) : new Response(null, { status: 302, headers: { Location: location } }));
    const budget = new LogReadBudget(fetchImpl as typeof fetch);
    const page = await readGitHubLogs({
      owner: "o", repo: "r", runId: "1"
    }, { maxLines: 200 }, budget, async () => "token");
    expect(page.entries[0].status).toBe(status);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    budget.close();
  }
});
it("caps each call at five jobs and resumes the remaining job", async () => {
  const fetchImpl = vi.fn(async (url) => String(url).includes("/jobs?") ? Response.json({ total_count: 6, jobs: Array.from({ length: 6 }, (_, i) => ({
      id: i + 1, status: "completed", conclusion: "success"
    })) }) : new Response("ok"));
  const target = {
    owner: "o", repo: "r", runId: "1"
  };
  const budget = new LogReadBudget(fetchImpl as typeof fetch);
  const first = await readGitHubLogs(target, { maxLines: 200 }, budget, async () => "t");
  expect(first.entries).toHaveLength(5);
  expect(first.next).toMatchObject({ index: 5, jobId: "6" });
  budget.close();
  const nextBudget = new LogReadBudget(fetchImpl as typeof fetch);
  const second = await readGitHubLogs(target, { maxLines: 200, position: first.next! }, nextBudget, async () => "t");
  expect(second.entries).toHaveLength(1);
  expect(second.next).toBeNull();
  nextBudget.close();
});
it("reports in-progress jobs and expired logs without exposing raw errors", async () => {
  const fetchImpl = vi.fn(async (url) => String(url).includes("/jobs?") ? Response.json({ total_count: 2, jobs: [{
        id: 1, status: "in_progress", conclusion: null
      }, {
        id: 2, status: "completed", conclusion: "failure"
      }] }) : new Response("token=secret", { status: 410 }));
  const budget = new LogReadBudget(fetchImpl as typeof fetch);
  const result = await readGitHubLogs({
    owner: "o", repo: "r", runId: "1"
  }, { maxLines: 200 }, budget, async () => "t");
  expect(result.entries.map(e => e.status)).toEqual(["not_found", "not_ready"]);
  expect(JSON.stringify(result)).not.toContain("secret");
  budget.close();
});
