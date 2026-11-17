"use client";

import React, { useActionState, useState } from "react";
import type { ImportedLoginReview } from "./login-review";
import { confirmLoginReviewAction } from "./login-review-actions";
import { prepareExistingAppAction } from "./actions";

export function LoginReviewPanel({ appId, review, prompt }: { appId: string; review: ImportedLoginReview; prompt: string }) {
  const [state, action, pending] = useActionState(confirmLoginReviewAction.bind(null, appId), { error: null });
  const [copyStatus, setCopyStatus] = useState("");
  if (review.status === "NOT_REQUIRED") return null;
  if (review.status === "REVIEWED" && !review.publishingUpdateRequired) return <section className="info-box" aria-label="Sign-in review"><p>The current app code has a recorded sign-in review. Live Microsoft sign-in and any browser warning still need to be checked after publishing.</p></section>;
  return (
    <section className="info-box" aria-label="Sign-in review">
      <h2>Check sign-in before publishing</h2>
      <p>Some default sign-in screens can trigger a browser warning. Have Codex check your app’s sign-in page and access protections, and run the relevant tests before the first publish.</p>
      {review.status === "UNAVAILABLE" ? <p>We could not check the current app code. Refresh this page when the repository is available; sign-in review is still required.</p> : null}
      {review.findings.filter(finding => finding.code === "DEFAULT_AUTHJS_SIGNIN").map(finding => <p className="warning-box" key={finding.code}>{finding.message}</p>)}
      {review.publishingUpdateRequired ? <div>
        <p>This app needs updated publishing support before its first publish. Open a GitHub review, merge the publishing update, then return to verify preparation and review sign-in again.</p>
        {review.canRefreshPublishing ? <form action={prepareExistingAppAction.bind(null, appId)}><input type="hidden" name="preparationMode" value="PULL_REQUEST" /><button type="submit" className="btn btn--secondary">Review publishing update</button></form> : <a href={`/onboarding/${appId}`}>Continue publishing preparation</a>}
      </div> : null}
      <button type="button" className="btn btn--secondary btn--sm" onClick={async () => {
        try { await navigator.clipboard.writeText(prompt); setCopyStatus("Copied. Paste it into your app’s Codex project."); }
        catch { setCopyStatus("Select and copy the instructions below."); }
      }}>Copy sign-in review prompt</button>
      <p role="status">{copyStatus}</p>
      <details><summary>View sign-in review prompt</summary><textarea aria-label="Codex sign-in review prompt" value={prompt} readOnly rows={10} style={{ width: "100%", boxSizing: "border-box" }} /></details>
      {review.commitSha && !review.publishingUpdateRequired ? (
        <form action={action} style={{ marginTop: "1rem" }}>
          <input type="hidden" name="commitSha" value={review.commitSha} />
          <details open={review.sourcePaths.length === 0 ? true : undefined}>
            <summary>Files from Codex’s review</summary>
            <p>Commit checked: <code>{review.commitSha}</code></p>
            <label>Paste the source file list supplied by Codex, one file per line. Do not paste code or secrets.
              <textarea aria-label="Reviewed source files" name="sourcePaths" defaultValue={review.sourcePaths.join("\n")} required rows={3} style={{ width: "100%", boxSizing: "border-box" }} />
            </label>
          </details>
          <label><input type="checkbox" name="checksConfirmed" required /> Codex has checked the custom sign-in page, server-side sign-in, access restrictions, return links and Microsoft sign-in protections, and the relevant tests passed for the uploaded app.</label>
          <p>Refresh this page after Codex uploads changes, then confirm. A later code change requires another review before the first publish.</p>
          {state.error ? <p role="alert">{state.error}</p> : null}
          <button type="submit" className="btn btn--secondary" disabled={pending}>{pending ? "Recording review…" : "Confirm sign-in review"}</button>
        </form>
      ) : <p>Codex can record the source files it inspected through the CU Launch plugin after completing the review.</p>}
    </section>
  );
}
