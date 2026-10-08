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
    <section aria-label="Share with Cedarville" className="card">
      <p className="section-title">Share with Cedarville</p>
      <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
        Sharing with Cedarville lets people who sign in to CU Launch
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
            <span className="badge badge--success">Shared with Cedarville</span>
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
            idleLabel="Remove from Cedarville Sharing"
            pendingLabel="Removing..."
            statusText="Removing the app from Cedarville Sharing."
            variant="ghost"
            size="sm"
          />
        ) : (
          <PendingSubmitButton
            idleLabel="Share with Cedarville"
            pendingLabel="Sharing..."
            statusText="Sharing the app with Cedarville."
            variant="primary-solid"
            size="sm"
          />
        )}
      </form>
    </section>
  );
}
