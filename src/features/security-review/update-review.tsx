"use client";

import React, { useId, useState } from "react";
import type { ReviewResults } from "./results";
import { checkLabels, type SecurityUpdate } from "./update-types";

type Apply = (number: number, head: string, base: string) => Promise<{ applied: boolean; message: string }>;
type Alert = NonNullable<ReviewResults["dependency"]>["alerts"][number];
export type UpdateControls = { apply?: Apply; automaticPublishing?: boolean; live?: boolean };

export function UpdateReview({ update, alerts, appName, repository, apply, live, automaticPublishing }: UpdateControls & {
  update: SecurityUpdate; alerts: Alert[]; appName: string; repository: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ applied: boolean; message: string } | null>(null);
  const covered = alerts.filter(a => update.alerts.includes(a.number));
  const packages = [...new Set(covered.map(a => a.package))].join(", ");
  const url = repository + "/pull/" + update.number;
  async function confirmApply() {
    if (!apply || pending || result?.applied) return;
    setPending(true);
    try { setResult(await apply(update.number, update.head, update.base)); }
    catch { setResult({ applied: false, message: "The response was interrupted. Refresh the review to check whether the update was applied." }); }
    finally { setPending(false); }
  }
  return <article className="security-update" aria-label={`Security update ${update.number}`}>
    <div className="security-update__summary">
      <div><h4>{packages}</h4><p>{covered.length} security {covered.length === 1 ? "issue" : "issues"} covered · {checkLabels[update.checks]}</p></div>
      <button type="button" className="btn btn--primary-solid" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? "Close review" : "Review update"}</button>
    </div>
    <div id={id} hidden={!open} className="security-update__body">
      <h5>What will change</h5>
      <p>Dependabot prepared an update to {packages}, software that {appName} uses.</p>
      <h5>Test results</h5>
      <p>{update.checks === "failed" ? "A check failed. Ask Codex to investigate before applying this update." :
        update.checks === "pending" ? "Checks are still running. Refresh this page to see when they finish." :
        update.checks === "passed" ? (update.checkSource === "actions" ? "The GitHub Actions checks passed for this version." : "All reported checks passed for this version.") : "CU Launch couldn’t verify passing checks for this version. Codex can run the tests with you."}</p>
      {update.checkNames.length > 0 && <details><summary>View checks ({update.checkNames.length})</summary><ul>{update.checkNames.map((name, index) => <li key={index}>{name}</li>)}</ul></details>}
      {live && update.ready && apply && !result?.applied && <div className="security-update__apply">
        <p>Applying this update adds it to <strong>{update.branch}</strong>. {automaticPublishing ? "This can automatically publish a new version of your app." : "You can publish the new version when you’re ready."}</p>
        <button type="button" className="btn btn--primary-solid" disabled={pending} onClick={confirmApply}>{pending ? "Applying…" : "Apply update"}</button>
      </div>}
      {live && !update.ready && update.checks === "passed" && <p>GitHub still needs a review or another branch requirement before you can apply this update.</p>}
      {!live && <p>This saved review shows the last known results. Applying an update requires a live check with GitHub.</p>}
      {live && update.ready && !apply && <p>An app owner or administrator can apply this update.</p>}
      <p role="status">{result?.message}</p>
      <p className="security-update__link"><a href={url} target="_blank" rel="noreferrer">View pull request #{update.number} on GitHub</a></p>
    </div>
  </article>;
}
