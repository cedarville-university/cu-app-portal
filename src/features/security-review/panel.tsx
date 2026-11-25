import React from "react";
import { UpdateReview, type UpdateControls } from "./update-review";
import { CopyFixInstructions } from "./copy-instructions";
import { ReviewFindings } from "./review-findings";
import { fixInstructions, needsAttention, type ReviewResults } from "./results";

function DependabotHandoff({ appName, repository }: { appName: string; repository: string }) {
  const prompt = [
    `Handle all open Dependabot pull requests for ${appName} in ${repository} together. Verify the attached project and its Git remote match this repository. Use a separate clean worktree to preserve my existing work.`,
    "Read every page of open GitHub pull requests in this repository. Verify the Dependabot bot identity, repository, base branch, current head and diff for each. Include version updates and security updates, even those missing from CU Launch. If none are open, report that and stop.",
    "Group compatible changes by target branch. Reconcile overlapping package and lockfile changes with the project's package manager, including transitive dependencies. Account for every PR and alert. Leave conflicting or unverified fixes open and explain why. Keep unrelated work out of the batch.",
    "Test the combined result on the current base with the project's tests and build. Report failures or missing coverage. Present one plain-language summary of fixes, blockers, and the exact merge and cleanup plan. Ask once for approval before committing, pushing, merging or closing PRs. Explain any automatic publishing triggered by a merge. Ask before using the CU Launch connector.",
    "After approval, carry out the agreed plan, respect branch protections and required checks, and verify the merged result on each target branch. Before closing a superseded PR, re-read its current head and confirm every change is covered by the merged code and resolved dependency versions. Link the merged fix when closing it. Leave newly changed, uncovered or blocked PRs open. Only remove clean temporary worktrees and branches created for this task after verifying their work is safely merged.",
    "Refresh GitHub and give me one final summary of merged fixes, closed PRs, completed cleanup and anything still open. Distinguish alerts still awaiting GitHub rechecking from confirmed resolutions.",
  ].join("\n\n");
  return <>
    <h4>Handle all updates together</h4>
    <p>Codex can test the updates together and ask you to approve one plan. After the fixes are merged, it can close the requests they cover.</p>
    <a className="btn btn--primary-solid" href={`codex://threads/new?${new URLSearchParams({ prompt })}`}>Open in Codex</a>
    <CopyFixInstructions confirmed={false} instructions={prompt} label="update instructions" secondary />
  </>;
}

export function SecurityReviewPanel({ appName, repository, review, controls }: {
  controls?: UpdateControls;
  appName: string; repository: string | null; review: { checkedAt: Date; results: ReviewResults } | null;
}) {
  if (!review || !repository) return <p className="card">No security scan results are available for this app yet.</p>;
  const { results } = review;
  const action = needsAttention(results);
  const alerts = results.dependency?.alerts ?? [];
  const hasIssues = alerts.length > 0 || results.checks.some(c => c.outcome === "finding");
  const updates = (results.dependency?.updates ?? []).filter(u => alerts.some(a => u.alerts.includes(a.number)));
  const covered = new Set(updates.flatMap(u => u.alerts));
  const remaining = { ...results, dependency: results.dependency && { ...results.dependency, alerts: alerts.filter(a => !covered.has(a.number)) } };
  const remainingIssues = Boolean(remaining.dependency?.alerts.length || remaining.checks.some(c => c.outcome === "finding"));
  const partial = results.source?.complete === false;
  const date = review.checkedAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "America/New_York" });
  return <div className="security-review">
    <p className="security-review__date">Last checked <time dateTime={review.checkedAt.toISOString()}>{date}</time></p>
    <section className="card">
      <h3>{hasIssues ? "We found security issues in your app" : action ? "A security check needs a closer look" : partial ? "No issues found in the checks that ran" : "The completed checks found no issues"}</h3>
      {partial && <p>Some files could not be checked.</p>}
      {updates.length > 0 ? <>
        <DependabotHandoff appName={appName} repository={repository} />
        <details>
          <summary>Review individual security updates ({updates.length})</summary>
          {updates.map(update => <UpdateReview key={update.number + update.head} appName={appName} repository={repository} update={update} alerts={alerts} {...controls} />)}
        </details>
      </> : results.dependency && <details>
        <summary>Check for other Dependabot updates</summary>
        <DependabotHandoff appName={appName} repository={repository} />
      </details>}
      {needsAttention(remaining) ? <>
        <p>{updates.length ? "Some findings still need a closer look. Codex can help you with those separately." : alerts.length ? "Some software in your app’s project has known security issues. Ask Codex to check which updates your app needs." :
          "Ask Codex to check the findings against your app’s code."}</p>
        {results.dependency?.updates?.length === 0 && alerts.length > 0 && <p>Dependabot hasn’t linked an open update to these findings yet.</p>}
        <h4>{updates.length ? "Findings that need your help" : hasIssues ? "How to fix this" : "How to review this"}</h4>
        <p>Copy the instructions, open the <strong>{appName}</strong> project in Codex, and paste them into a new chat. Codex will explain what it finds and test any changes. You decide whether to publish.</p>
        <CopyFixInstructions confirmed={remainingIssues} instructions={fixInstructions(appName, repository, remaining)} />
      </> : !updates.length && <p>You can review what was checked below.</p>}
    </section>
    <ReviewFindings results={results} repository={repository} />
  </div>;
}
