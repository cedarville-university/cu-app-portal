"use client";

import React, { useActionState, useEffect, useRef } from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import {
  sendCollaborationInviteFormAction,
  type CollaborationInviteFormState,
} from "./actions";

type FormAction = (formData: FormData) => void | Promise<void>;

const initialCollaborationInviteFormState: CollaborationInviteFormState = {
  error: null,
  deliveryStatus: null,
  unverifiedInviteEmail: null,
};

export function CollaborationInviteForm({
  appRequestId,
  initialState = initialCollaborationInviteFormState,
}: {
  appRequestId: string;
  initialState?: CollaborationInviteFormState;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    sendCollaborationInviteFormAction.bind(null, appRequestId),
    initialState,
  );

  useEffect(() => {
    if (state.deliveryStatus === "SENT") {
      formRef.current?.reset();
    }
  }, [state.deliveryStatus]);

  return (
    <form
      action={formAction as unknown as FormAction}
      ref={formRef}
      style={{
        display: "flex",
        gap: "0.625rem",
        flexWrap: "wrap",
        alignItems: "flex-end",
        marginBottom: "1rem",
      }}
    >
      <label
        style={{
          display: "grid",
          gap: "0.25rem",
          flex: "1 1 260px",
          maxWidth: "360px",
        }}
      >
        <span>Coworker email</span>
        <input
          name="email"
          type="email"
          required
          placeholder="name@cedarville.edu"
          className="form-control"
        />
      </label>
      <PendingSubmitButton
        idleLabel="Send Invite"
        pendingLabel="Sending Invite..."
        statusText="Sending collaboration invite."
        variant="primary-solid"
        size="sm"
      />
      {state.error ? (
        <div
          className="error-box"
          role="alert"
          style={{
            display: "grid",
            gap: "0.75rem",
            flexBasis: "100%",
            margin: 0,
          }}
        >
          <span>{state.error}</span>
          {state.unverifiedInviteEmail ? (
            <span>
              <input
                name="unverifiedEmail"
                type="hidden"
                value={state.unverifiedInviteEmail}
              />
              <PendingSubmitButton
                idleLabel="Send Without Verification"
                pendingLabel="Sending Invite..."
                statusText="Sending unverified collaboration invite."
                variant="secondary-solid"
                size="sm"
                name="sendUnverifiedInvite"
                value="true"
              />
            </span>
          ) : null}
        </div>
      ) : null}
      {state.deliveryStatus === "FAILED" ? (
        <div
          className="error-box"
          role="alert"
          style={{ flexBasis: "100%", margin: 0 }}
        >
          The invite was saved, but the email could not be delivered. Try
          resending it.
        </div>
      ) : null}
      {state.deliveryStatus === "SENT" ? (
        <p
          role="status"
          style={{
            color: "var(--text-secondary)",
            flexBasis: "100%",
            margin: 0,
          }}
        >
          Invite sent.
        </p>
      ) : null}
    </form>
  );
}
