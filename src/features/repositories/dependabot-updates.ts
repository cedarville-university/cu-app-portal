import type { SecurityUpdate } from "../security-review/update-types";

type Headers = Record<string, string>;
type Repo = { owner: string; name: string };
type AlertNode = { number: number; dependabotUpdate: { pullRequest: { number: number } | null } | null };
type Context = { name?: string; context?: string; status?: string; conclusion?: string | null; state?: string };
type Pull = {
  number: number; state: string; isDraft: boolean; author: { __typename: string; login: string } | null;
  headRepository: { nameWithOwner: string } | null; headRefOid: string; baseRefOid: string; baseRefName: string;
  mergeable: string; mergeStateStatus: string; reviewDecision: string | null;
};
type Repository = {
  nameWithOwner: string; defaultBranchRef: { name: string; target: { oid: string } } | null;
  squashMergeAllowed: boolean; mergeCommitAllowed: boolean; rebaseMergeAllowed: boolean;
};
const associations = `query($owner:String!,$name:String!,$after:String) {
  repository(owner:$owner,name:$name) { nameWithOwner vulnerabilityAlerts(first:50,after:$after,states:[OPEN]) {
    nodes { number dependabotUpdate { pullRequest { number } } } pageInfo { hasNextPage endCursor }
  } }
}`;
const details = `query($owner:String!,$name:String!,$number:Int!) {
  repository(owner:$owner,name:$name) { nameWithOwner defaultBranchRef { name target { oid } }
    squashMergeAllowed mergeCommitAllowed rebaseMergeAllowed
    pullRequest(number:$number) { number state isDraft author { __typename login } headRepository { nameWithOwner }
      headRefOid baseRefOid baseRefName mergeable mergeStateStatus reviewDecision }
  }
}`;
const checksQuery = `query($owner:String!,$name:String!,$number:Int!) {
  repository(owner:$owner,name:$name) { pullRequest(number:$number) {
    commits(last:1) { nodes { commit { oid statusCheckRollup { state contexts(first:100) { totalCount nodes {
      ... on CheckRun { name status conclusion } ... on StatusContext { context state }
    } } } } } }
  } }
}`;
type Rollup = { state: string; contexts: { totalCount: number; nodes: Context[] } };
export function summarizeChecks(rollup?: Rollup | null): Pick<SecurityUpdate, "checks" | "checkNames"> {
  const nodes = rollup?.contexts.nodes ?? [];
  const checkNames = nodes.map(c => {
    const result = c.status && c.status !== "COMPLETED" ? c.status : c.conclusion ?? c.state ?? "unknown";
    return (c.name ?? c.context ?? "Unnamed check") + " · " + result.toLowerCase().replaceAll("_", " ");
  });
  let checks: SecurityUpdate["checks"] = "unavailable";
  const states = nodes.map(c => c.status && c.status !== "COMPLETED" ? "PENDING" : c.conclusion ?? c.state);
  if (["ERROR","FAILURE"].includes(rollup?.state ?? "") || states.some(s => ["ERROR","FAILURE","TIMED_OUT","CANCELLED","ACTION_REQUIRED","STARTUP_FAILURE","STALE"].includes(s ?? ""))) checks = "failed";
  else if (rollup?.state === "PENDING" || states.includes("PENDING") || states.includes("EXPECTED")) checks = "pending";
  else if (rollup?.state === "SUCCESS" && nodes.length > 0 && nodes.length === rollup.contexts.totalCount && states.every(s => s === "SUCCESS")) checks = "passed";
  return { checks, checkNames };
}

export function dependabotUpdates(fetchImpl: typeof fetch, headersFor: (repo: string, permissions: Record<string,string>) => Promise<Headers>) {
  async function query<T>(headers: Headers, document: string, variables: object): Promise<T> {
    const response = await fetchImpl("https://api.github.com/graphql", {
      method: "POST", headers, body: JSON.stringify({ query: document, variables }), cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || result.errors?.length || !result.data?.repository) throw new Error("GitHub could not verify the security update.");
    return result.data.repository;
  }

  // Some installations grant Actions read access without granting Checks or Commit statuses.
  // Only count jobs that GitHub binds to this pull request and its exact revision.
  async function actionChecks(repo: Repo, pr: Pull, headers: Headers) {
    const path = "https://api.github.com/repos/" + [repo.owner, repo.name].map(encodeURIComponent).join("/") + "/actions/runs";
    async function read<T>(url: string): Promise<T> {
      const res = await fetchImpl(url, { headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("Could not read workflow checks.");
      return res.json();
    }
    type Run = { id: number; run_attempt: number; name: string; event: string; head_sha: string; status: string; conclusion: string | null;
      pull_requests: { number: number; head: { sha: string }; base: { ref: string } }[] };
    const page = await read<{ total_count: number; workflow_runs: Run[] }>(path + "?event=pull_request&per_page=100&head_sha=" + pr.headRefOid);
    if (page.total_count !== page.workflow_runs.length) return summarizeChecks();
    const runs = page.workflow_runs.filter(r => r.event === "pull_request" && r.head_sha === pr.headRefOid && r.pull_requests.some(
      linked => linked.number === pr.number && linked.head.sha === pr.headRefOid && linked.base.ref === pr.baseRefName));
    const nodes: Context[] = [];
    for (const run of runs) {
      nodes.push({ name: run.name, status: run.status.toUpperCase(), conclusion: run.conclusion?.toUpperCase() });
      if (run.conclusion !== "success") continue;
      const jobs = await read<{ total_count: number; jobs: { name: string; head_sha: string; status: string; conclusion: string | null }[] }>(
        path + "/" + run.id + "/attempts/" + run.run_attempt + "/jobs?per_page=100");
      if (!jobs.jobs.length || jobs.total_count !== jobs.jobs.length || jobs.jobs.some(j => j.head_sha !== pr.headRefOid)) return summarizeChecks();
      nodes.push(...jobs.jobs.map(j => ({ name: j.name, status: j.status.toUpperCase(), conclusion: j.conclusion?.toUpperCase() })));
    }
    return summarizeChecks({ state: "SUCCESS", contexts: { totalCount: nodes.length, nodes } });
  }

  async function readUpdates(repo: Repo, only?: number) {
    const expected = (repo.owner + "/" + repo.name).toLowerCase();
    const headers = await headersFor(repo.name, { vulnerability_alerts: "read", pull_requests: "read", contents: "read" });
    const groups = new Map<number, Set<number>>();
    let after: string | null = null;
    const cursors = new Set<string>();
    do {
      const page: { nameWithOwner: string; vulnerabilityAlerts: { nodes: AlertNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } =
        await query(headers, associations, { ...repo, after });
      if (page.nameWithOwner.toLowerCase() !== expected) throw new Error("Repository changed.");
      for (const alert of page.vulnerabilityAlerts.nodes) {
        const number = alert.dependabotUpdate?.pullRequest?.number;
        if (number && (!only || only === number)) {
          const ids = groups.get(number) ?? new Set<number>();
          groups.set(number, ids.add(alert.number));
        }
      }
      const next = page.vulnerabilityAlerts.pageInfo;
      if (next.hasNextPage && (!next.endCursor || cursors.has(next.endCursor))) throw new Error("Incomplete security update list.");
      after = next.hasNextPage ? next.endCursor : null;
      if (after) cursors.add(after);
    } while (after);
    if (!groups.size) return [];
    // An installation may be able to read pull requests before it can read their test results.
    const checkHeaders = await headersFor(repo.name, { checks: "read", statuses: "read", pull_requests: "read", contents: "read" }).catch(() => null);
    const actionsHeaders = checkHeaders ? null : await headersFor(repo.name, { actions: "read" }).catch(() => null);
    const updates = [];
    for (const [number, alerts] of groups) {
      const repository = await query<Repository & { pullRequest: Pull | null }>(headers, details, { ...repo, number });
      const pr = repository.pullRequest;
      const branch = repository.defaultBranchRef;
      if (!pr || !branch || repository.nameWithOwner.toLowerCase() !== expected || pr.headRepository?.nameWithOwner.toLowerCase() !== expected ||
          pr.state !== "OPEN" || pr.number !== number || pr.baseRefName !== branch.name || pr.author?.__typename !== "Bot" ||
          !["dependabot", "dependabot[bot]"].includes(pr.author.login)) continue;
      type CheckResponse = { pullRequest: { commits: { nodes: { commit: { oid: string; statusCheckRollup: Rollup | null } }[] } } };
      const checked = checkHeaders ? await query<CheckResponse>(checkHeaders, checksQuery, { ...repo, number }).catch(() => null) : null;
      const commit = checked?.pullRequest?.commits.nodes[0]?.commit;
      const status = actionsHeaders
        ? await actionChecks(repo, pr, actionsHeaders).catch(() => summarizeChecks())
        : summarizeChecks(commit?.oid === pr.headRefOid ? commit.statusCheckRollup : null);
      const method = repository.squashMergeAllowed ? "squash" : repository.mergeCommitAllowed ? "merge" : repository.rebaseMergeAllowed ? "rebase" : null;
      const ready = Boolean(method && !pr.isDraft && pr.mergeable === "MERGEABLE" && pr.mergeStateStatus === "CLEAN" &&
        !["CHANGES_REQUESTED", "REVIEW_REQUIRED"].includes(pr.reviewDecision ?? "") && pr.baseRefOid === branch.target.oid && status.checks === "passed");
      updates.push({ number, head: pr.headRefOid, base: pr.baseRefOid, branch: branch.name, alerts: [...alerts], ...status, checkSource: actionsHeaders ? "actions" as const : "rollup" as const, ready, method });
    }
    return updates;
  }

  async function applyUpdate(repo: Repo, number: number, head: string, base: string) {
    const [update] = await readUpdates(repo, number);
    if (!update?.ready || update.head !== head || update.base !== base) return false;
    const headers = await headersFor(repo.name, { contents: "write" });
    const path = [repo.owner, repo.name].map(encodeURIComponent).join("/");
    const response = await fetchImpl(`https://api.github.com/repos/${path}/pulls/${number}/merge`, {
      method: "PUT", headers, redirect: "error", body: JSON.stringify({ sha: head, merge_method: update.method }),
    });
    return response.ok && (await response.json()).merged === true;
  }
  return { readUpdates, applyUpdate };
}
