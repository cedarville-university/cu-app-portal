import React from "react";
import { UpdateReview, type UpdateControls } from "./update-review";
import { CopyFixInstructions } from "./copy-instructions";
import { ReviewFindings } from "./review-findings";
import { fixInstructions, needsAttention, type ReviewResults } from "./results";

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
      {updates.length > 0 && <>
        <p>{updates.length === 1 ? "A security update is ready to review." : "Security updates are ready to review."} Check what will change and decide whether to apply it or ask Codex for help.</p>
        {updates.map(update => <UpdateReview key={update.number + update.head} appName={appName} repository={repository} update={update} alerts={alerts} {...controls} />)}
      </>}
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
