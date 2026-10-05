"use client";

import React, { useActionState } from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { updatePublishingStateAction } from "./publishing-actions";

export function PublishingRecoveryPanel({ appRequestId }: { appRequestId: string }) {
  const [state, action] = useActionState(updatePublishingStateAction.bind(null, appRequestId), { message: "" });
  return (
    <form action={action} className="form-stack">
      <label className="form-group">
        <span className="form-label">Recovery action</span>
        <select name="operation" className="form-control" defaultValue="reconcile">
          <option value="reconcile">Check and recover publishing</option>
          <option value="fail">End an abandoned publish as failed</option>
          <option value="reset-setup">Mark publishing setup as needing repair</option>
          <option value="clear-errors">Clear old publishing error notes</option>
        </select>
      </label>
      <p>Recovery checks the recorded GitHub deployment and the app health endpoint before recording success. Recovery preserves active worker leases and waits for recorded deployments that are still running.</p>
      <label className="form-group">
        <span className="form-label">Reason for a manual correction</span>
        <textarea className="form-control" name="reason" maxLength={500} rows={2} />
      </label>
      <label><input type="checkbox" name="confirmStopped" /> I confirmed that the interrupted worker and any GitHub deployment have stopped. Required when ending an attempt or resetting setup.</label>
      <PendingSubmitButton idleLabel="Apply Recovery Action" pendingLabel="Checking…" statusText="Checking publishing evidence and updating the portal record." variant="secondary" />
      {state.message ? <p role={state.error ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  );
}
