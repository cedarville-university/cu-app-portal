"use client";

import React, { useActionState } from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { deleteEnvVarFormAction, type EnvVarDeleteState } from "./actions";

type FormAction = (formData: FormData) => void | Promise<void>;

const initialEnvVarDeleteState: EnvVarDeleteState = { error: null };

export function EnvVarDeleteForm({
  appRequestId,
  envKey,
}: {
  appRequestId: string;
  envKey: string;
}) {
  const [state, formAction] = useActionState(
    deleteEnvVarFormAction.bind(null, appRequestId, envKey),
    initialEnvVarDeleteState,
  );

  return (
    <form action={formAction as unknown as FormAction}>
      <PendingSubmitButton
        idleLabel="Delete"
        pendingLabel="Deleting..."
        statusText={`Deleting ${envKey}.`}
        variant="danger"
        size="sm"
        ariaLabel={`Delete ${envKey}`}
      />
      {state.error ? (
        <div
          className="error-box"
          role="alert"
          style={{ marginTop: "0.5rem" }}
        >
          {state.error}
        </div>
      ) : null}
    </form>
  );
}
