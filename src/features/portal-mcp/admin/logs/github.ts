import { z } from "zod";
import { LogReadBudget, checkLogResponse, parseLogJson } from "./http";
import { LogReadError, sourceFailure, type GitHubPosition, type ProviderLogPage, type LogEntry } from "./types";
const jobSchema = z.object({
  id: z.number().int().positive(), name: z.string().optional(), status: z.string(), conclusion: z.string().nullable().optional(), started_at: z.string().nullable().optional()
});
const jobsSchema = z.object({ total_count: z.number().int().nonnegative(), jobs: z.array(jobSchema).max(100) });
export function isGitHubDownloadUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && (u.hostname.endsWith(".blob.core.windows.net") || u.hostname.endsWith(".actions.githubusercontent.com"));
  }
  catch {
    return false;
  }
}
export async function readGitHubLogs(target: {
  owner: string;
  repo: string;
  runId: string;
}, selection: {
  maxLines: number;
  position?: GitHubPosition;
}, budget: LogReadBudget, token: () => Promise<string>): Promise<ProviderLogPage<GitHubPosition>> {
  const base = `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions`;
  const p = selection.position ?? {
    page: 1, index: 0, offset: 0
  };
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  try {
    const response = await budget.request(`${base}/runs/${encodeURIComponent(target.runId)}/jobs?per_page=100&page=${p.page}&filter=latest`, { headers }, token);
    checkLogResponse(response);
    const parsed = jobsSchema.safeParse(parseLogJson(response.text));
    if (!parsed.success)
      throw new LogReadError("unavailable", "The provider returned unsupported job metadata.");
    const jobs = parsed.data.jobs.sort((a, b) => Number(b.conclusion === "failure") - Number(a.conclusion === "failure") || a.id - b.id);
    if (p.jobId && String(jobs[p.index]?.id) !== p.jobId)
      throw new LogReadError("not_found", "The selected job page changed; request logs again without a cursor.");
    const entries: LogEntry[] = [];
    let next: GitHubPosition | null = null;
    for (let i = p.index; i < jobs.length && i < p.index + 5; i++) {
      const job = jobs[i];
      const identity = {
        source: "github" as const, runId: target.runId, jobId: String(job.id), name: job.name, providerStatus: job.status, conclusion: job.conclusion, timestamp: job.started_at, url: `https://github.com/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/runs/${target.runId}/job/${job.id}`
      };
      try {
        if (job.status !== "completed")
          throw new LogReadError("not_ready", "Job logs are not yet available; this job is still in progress.");
        const redirect = await budget.request(`${base}/jobs/${job.id}/logs`, { headers }, token);
        const location = redirect.headers.get("Location");
        let text: string;
        if (redirect.status === 302) {
          if (!location || !isGitHubDownloadUrl(location))
            throw new LogReadError("unavailable", "The provider returned an unexpected log download destination.");
          const downloaded = await budget.request(location);
          checkLogResponse(downloaded);
          text = downloaded.text;
        }
        else {
          checkLogResponse(redirect);
          text = redirect.text;
        }
        const clip = budget.excerpt(text, i === p.index ? p.offset : 0, selection.maxLines);
        entries.push({
          ...identity, status: clip.text ? "available" as const : "empty" as const, text: clip.text, lineCount: clip.nextLine, truncated: clip.truncated
        });
        if (clip.truncated) {
          next = {
            page: p.page, index: i, jobId: String(job.id), offset: clip.nextOffset
          };
          break;
        }
      }
      catch (error) {
        entries.push({ ...identity, ...sourceFailure("github", error) });
      }
      if (i + 1 < jobs.length)
        next = {
          page: p.page, index: i + 1, offset: 0, jobId: String(jobs[i + 1].id)
        };
      else
        next = null;
      if (budget.remainingOutput <= 0)
        break;
    }
    if (!next && p.page * 100 < parsed.data.total_count)
      next = {
        page: p.page + 1, index: 0, offset: 0
      };
    if (!entries.length)
      entries.push({
        source: "github", status: "empty", message: "No jobs are recorded for this workflow run."
      });
    return { entries, next };
  }
  catch (error) {
    return { entries: [sourceFailure("github", error)], next: null };
  }
}
