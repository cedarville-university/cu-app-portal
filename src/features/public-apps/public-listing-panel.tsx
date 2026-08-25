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
    <section aria-label="Share in Portal" className="card">
      <p className="section-title">Share in Portal</p>
      <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
        Sharing in the portal lets Cedarville people who sign in to the portal
        see this app&apos;s name, description, and link. It does not change who can
        open your published app.
      </p>
      <div
        className="status-table"
        style={{ marginBottom: "1rem" }}
      >
        <div className="status-row">
          <span className="status-row__label">Status</span>
          {isPubliclyListed ? (
            <span className="badge badge--success">Shared in portal</span>
          ) : (
            <span className="badge badge--default">Not shared</span>
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
            idleLabel="Remove from Portal sharing"
            pendingLabel="Removing..."
            statusText="Removing the app from Portal sharing."
            variant="ghost"
            size="sm"
          />
        ) : (
          <PendingSubmitButton
            idleLabel="Share in Portal"
            pendingLabel="Sharing..."
            statusText="Sharing the app in the portal."
            variant="primary-solid"
            size="sm"
          />
        )}
      </form>
    </section>
  );
}
