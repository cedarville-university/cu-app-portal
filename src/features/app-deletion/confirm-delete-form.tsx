"use client";

import React, { useRef, useState } from "react";

export function ConfirmDeleteForm({
  action,
  children,
  className,
}: {
  action: React.ComponentProps<"form">["action"];
  children: React.ReactNode;
  className?: string;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const allowSubmitRef = useRef(false);
  const canDelete = confirmationText === "delete";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (allowSubmitRef.current) {
      allowSubmitRef.current = false;
      return;
    }

    event.preventDefault();
    setConfirmationText("");
    setIsConfirming(true);
  }

  function cancelConfirmation() {
    setIsConfirming(false);
    setConfirmationText("");
  }

  function confirmDeletion() {
    if (!canDelete) return;

    allowSubmitRef.current = true;
    setIsConfirming(false);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form
        action={action}
        className={className}
        onSubmit={handleSubmit}
        ref={formRef}
      >
        {children}
      </form>
      {isConfirming ? (
        <div className="modal-backdrop">
          <div
            aria-labelledby="delete-confirmation-title"
            aria-modal="true"
            className="modal"
            role="dialog"
          >
            <h2 id="delete-confirmation-title">Confirm App Deletion</h2>
            <p>
              Type <strong>delete</strong> to confirm that you want to delete
              the selected resources.
            </p>
            <label className="form-stack">
              <span>Type delete to confirm</span>
              <input
                autoComplete="off"
                autoFocus
                className="form-control"
                onChange={(event) => setConfirmationText(event.target.value)}
                value={confirmationText}
              />
            </label>
            <div className="modal__actions">
              <button
                className="btn btn--secondary btn--sm"
                onClick={cancelConfirmation}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn btn--danger btn--sm"
                disabled={!canDelete}
                onClick={confirmDeletion}
                type="button"
              >
                Delete App
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
