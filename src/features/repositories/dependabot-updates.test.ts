import { describe, expect, it, vi } from "vitest";
import { dependabotUpdates, summarizeChecks } from "./dependabot-updates";

const repo = { owner: "example", name: "pilot" };
const head = "1".repeat(40);
const base = "2".repeat(40);
const defaultPull = { number: 8, state: "OPEN", isDraft: false, author: { __typename: "Bot", login: "dependabot" },
  headRepository: { nameWithOwner: "example/pilot" }, headRefOid: head, baseRefOid: base, baseRefName: "main",
  mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: null as string | null };
const green = { state: "SUCCESS", contexts: { totalCount: 1, nodes: [{ name: "Unit tests", status: "COMPLETED", conclusion: "SUCCESS" }] } };

function setup({ pr = defaultPull, rollup = green, actions = false, sha = head, alert = true, jobSha = head } = {}) {
  const writes: RequestInit[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (url, options) => {
    const body = JSON.parse(String(options?.body ?? "{}"));
    const result = (repository: object) => Response.json({ data: { repository } });
    if (options?.method === "PUT") { writes.push(options); return Response.json({ merged: true }); }
    if (String(url).includes("/attempts/")) return Response.json({ total_count: 1, jobs: [{ name: "Tests", status: "completed", conclusion: "success", head_sha: jobSha }] });
    if (String(url).includes("/actions/runs")) return Response.json({ total_count: 1, workflow_runs: [{
      id: 12, run_attempt: 2, name: "App checks", event: "pull_request", head_sha: head, status: "completed", conclusion: "success",
      pull_requests: [{ number: 8, head: { sha: head }, base: { ref: "main" } }],
    }] });
    if (body.query.includes("vulnerabilityAlerts")) return result({ nameWithOwner: "example/pilot", vulnerabilityAlerts: {
      nodes: alert ? [{ number: body.variables.after ? 2 : 1, dependabotUpdate: { pullRequest: { number: 8 } } }] : [],
      pageInfo: { hasNextPage: !body.variables.after, endCursor: "next" },
    } });
    if (body.query.includes("statusCheckRollup")) return result({ pullRequest: { commits: { nodes: [{ commit: { oid: sha, statusCheckRollup: rollup } }] } } });
    return result({ nameWithOwner: "example/pilot", defaultBranchRef: { name: "main", target: { oid: base } }, squashMergeAllowed: true, pullRequest: pr });
  });
  const scope = vi.fn(async (_repo: string, permissions: Record<string,string>) => {
    if (actions && permissions.checks) throw Error("No Checks permission");
    return { Authorization: "test" };
  });
  return { ...dependabotUpdates(fetchImpl, scope), writes, scope };
}

describe("Dependabot update review", () => {
  it("groups GitHub-linked alerts across pages and submits the reviewed commit", async () => {
    const client = setup();
    expect(await client.readUpdates(repo)).toMatchObject([{ number: 8, alerts: [1,2], ready: true, checks: "passed" }]);
    expect(await client.applyUpdate(repo, 8, head, base)).toBe(true);
    expect(JSON.parse(String(client.writes[0].body))).toEqual({ sha: head, merge_method: "squash" });
    expect(client.scope).toHaveBeenLastCalledWith("pilot", { contents: "write" });
  });
  it.each([
    ["moved head", { pr: { ...defaultPull, headRefOid: base } }],
    ["moved base", { pr: { ...defaultPull, baseRefOid: head } }],
    ["unrelated check", { sha: base }],
    ["unrelated fork", { pr: { ...defaultPull, headRepository: { nameWithOwner: "other/pilot" } } }],
    ["other author", { pr: { ...defaultPull, author: { __typename: "User", login: "dependabot" } } }],
    ["review required", { pr: { ...defaultPull, reviewDecision: "REVIEW_REQUIRED" } }],
    ["closed update", { pr: { ...defaultPull, state: "CLOSED" } }],
    ["unlinked update", { alert: false }],
    ["blocked branch", { pr: { ...defaultPull, mergeStateStatus: "BLOCKED" } }],
    ["draft update", { pr: { ...defaultPull, isDraft: true } }],
  ] as const)("blocks %s before obtaining write access", async (_, options) => {
    const client = setup(options);
    expect(await client.applyUpdate(repo, 8, head, base)).toBe(false);
    expect(client.writes).toHaveLength(0);
    expect(client.scope.mock.calls.some(([,p]) => p.contents === "write")).toBe(false);
  });
  it("uses exact-head Actions runs and jobs if the installation cannot read checks", async () => {
    expect(await setup({ actions: true }).readUpdates(repo)).toMatchObject([{ ready: true, checkSource: "actions", checkNames: ["App checks · success", "Tests · success"] }]);
    expect(await setup({ actions: true, jobSha: base }).applyUpdate(repo, 8, head, base)).toBe(false);
  });
  it.each([
    ["FAILURE", "failed"], ["TIMED_OUT", "failed"], ["CANCELLED", "failed"], ["NEUTRAL", "unavailable"], ["SKIPPED", "unavailable"],
  ])("does not report %s as passing", (conclusion, expected) => {
    expect(summarizeChecks({ state: "SUCCESS", contexts: { totalCount: 1, nodes: [{ name: "Test", status: "COMPLETED", conclusion }] } }).checks).toBe(expected);
  });
  it("keeps empty, truncated and running checks distinct", () => {
    expect(summarizeChecks().checks).toBe("unavailable");
    expect(summarizeChecks({ ...green, contexts: { ...green.contexts, totalCount: 101 } }).checks).toBe("unavailable");
    expect(summarizeChecks({ ...green, state: "PENDING" }).checks).toBe("pending");
  });
});
