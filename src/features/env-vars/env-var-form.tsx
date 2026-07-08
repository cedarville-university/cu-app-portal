"use client";

import React, { useActionState, useEffect, useRef } from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { saveEnvVarFormAction, type EnvVarFormState } from "./actions";

type FormAction = (formData: FormData) => void | Promise<void>;

const initialEnvVarFormState: EnvVarFormState = {
  error: null,
  savedKey: null,
};

export function EnvVarForm({ appRequestId }: { appRequestId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    saveEnvVarFormAction.bind(null, appRequestId),
    initialEnvVarFormState,
  );

  useEffect(() => {
    if (state.savedKey) {
      formRef.current?.reset();
    }
  }, [state.savedKey]);

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
      <label style={{ display: "grid", gap: "0.25rem", flex: "1 1 180px" }}>
        <span>Name</span>
        <input
          name="key"
          type="text"
          required
          placeholder="API_KEY"
          className="form-control"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label style={{ display: "grid", gap: "0.25rem", flex: "2 1 260px" }}>
        <span>Value</span>
        <input
          name="value"
          type="text"
          placeholder="value"
          className="form-control"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label
        style={{
          display: "flex",
          gap: "0.375rem",
          alignItems: "center",
          paddingBottom: "0.5rem",
        }}
      >
        <input name="isSecret" type="checkbox" value="true" />
        <span>Store as a secret</span>
      </label>
      <PendingSubmitButton
        idleLabel="Save Variable"
        pendingLabel="Saving..."
        statusText="Saving environment variable."
        variant="primary-solid"
        size="sm"
      />
      {state.error ? (
        <div
          className="error-box"
          role="alert"
          style={{ flexBasis: "100%", margin: 0 }}
        >
          {state.error}
        </div>
      ) : null}
      {state.savedKey ? (
        <p
          role="status"
          style={{
            color: "var(--text-secondary)",
            flexBasis: "100%",
            margin: 0,
          }}
        >
          Saved {state.savedKey}. Saving an existing name overwrites its value.
        </p>
      ) : null}
    </form>
  );
}
