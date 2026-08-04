import React from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { setPublicListingAction } from "./actions";

export function PublicListingPanel({
  appRequestId,
  isPubliclyListed,
}: {
  appRequestId: string;
  isPubliclyListed: boolean;
}) {
  return (
    <section aria-label="Public listing" className="card">
      <p className="section-title">Public Listing</p>
      <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
        Publicly listed apps appear on the Public Apps page, where any
        signed-in portal user can see the app&apos;s name, description, and
        link.
      </p>
      <div
        className="status-table"
        style={{ marginBottom: "1rem" }}
      >
        <div className="status-row">
          <span className="status-row__label">Status</span>
          {isPubliclyListed ? (
            <span className="badge badge--success">Listed publicly</span>
          ) : (
            <span className="badge badge--default">Not listed</span>
          )}
        </div>
      </div>
      <form
        action={setPublicListingAction.bind(
          null,
          appRequestId,
          !isPubliclyListed,
        )}
      >
        {isPubliclyListed ? (
          <PendingSubmitButton
            idleLabel="Remove from Public Apps"
            pendingLabel="Removing..."
            statusText="Removing the app from the public list."
            variant="ghost"
            size="sm"
          />
        ) : (
          <PendingSubmitButton
            idleLabel="List on Public Apps"
            pendingLabel="Listing..."
            statusText="Listing the app publicly."
            variant="primary-solid"
            size="sm"
          />
        )}
      </form>
    </section>
  );
}
