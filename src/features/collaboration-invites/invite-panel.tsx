import React from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import {
  resendCollaborationInviteAction,
  revokeCollaborationInviteAction,
  sendCollaborationInviteAction,
} from "./actions";

export type PendingInvite = {
  id: string;
  invitedEmail: string;
  invitedDisplayName: string;
  status: string;
  expiresAt: Date;
  lastSentAt: Date | null;
  inviter: { displayName: string; email: string };
};

type FormAction = (formData: FormData) => void | Promise<void>;

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function CollaborationInvitePanel({
  appRequestId,
  pendingInvites,
}: {
  appRequestId: string;
  pendingInvites: PendingInvite[];
}) {
  const sendAction = sendCollaborationInviteAction.bind(
    null,
    appRequestId,
  ) as unknown as FormAction;

  return (
    <section aria-label="Invite collaborators" className="card">
      <h2 className="section-title">Invite Collaborators</h2>
      <form
        action={sendAction}
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
      </form>

      {pendingInvites.length ? (
        <ul
          className="status-table"
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {pendingInvites.map((invite) => {
            const resendAction = resendCollaborationInviteAction.bind(
              null,
              appRequestId,
              invite.id,
            ) as unknown as FormAction;
            const revokeAction = revokeCollaborationInviteAction.bind(
              null,
              appRequestId,
              invite.id,
            ) as unknown as FormAction;

            return (
              <li
                key={invite.id}
                className="status-row"
                style={{
                  alignItems: "flex-start",
                  gap: "1rem",
                }}
              >
                <span
                  style={{
                    display: "grid",
                    gap: "0.25rem",
                    minWidth: 0,
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong>{invite.invitedDisplayName}</strong>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {invite.invitedEmail}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    Expires {formatDate(invite.expiresAt)}
                  </span>
                </span>
                <span
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <form action={resendAction}>
                    <PendingSubmitButton
                      idleLabel="Resend"
                      pendingLabel="Resending..."
                      statusText="Resending collaboration invite."
                      variant="ghost"
                      size="sm"
                      ariaLabel={`Resend invite to ${invite.invitedEmail}`}
                    />
                  </form>
                  <form action={revokeAction}>
                    <PendingSubmitButton
                      idleLabel="Revoke"
                      pendingLabel="Revoking..."
                      statusText="Revoking collaboration invite."
                      variant="danger"
                      size="sm"
                      ariaLabel={`Revoke invite to ${invite.invitedEmail}`}
                    />
                  </form>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          No pending invites.
        </p>
      )}
    </section>
  );
}
