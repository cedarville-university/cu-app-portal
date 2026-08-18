"use client";

import React, { useActionState } from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import {
  addExistingAppFormAction,
  type AddExistingAppFormState,
} from "./actions";

type FormAction = (formData: FormData) => void | Promise<void>;

const initialAddExistingAppFormState: AddExistingAppFormState = {
  error: null,
};

export function AddExistingAppForm({
  initialState = initialAddExistingAppFormState,
  initialValues = {},
}: {
  initialState?: AddExistingAppFormState;
  initialValues?: {
    repositoryUrl?: string;
    appName?: string;
  };
}) {
  const [state, formAction] = useActionState(
    addExistingAppFormAction,
    initialState,
  );

  return (
    <form action={formAction as unknown as FormAction} className="form-stack">
      <div className="form-group">
        <label htmlFor="repositoryUrl" className="form-label">
          GitHub Repository URL
        </label>
        <input
          id="repositoryUrl"
          name="repositoryUrl"
          type="url"
          required
          placeholder="https://github.com/owner/repo"
          defaultValue={initialValues.repositoryUrl ?? ""}
          className="form-control"
        />
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            marginTop: "0.375rem",
          }}
        >
          The web address of the repository — looks like{" "}
          <code>https://github.com/your-org/your-repo</code>
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="appName" className="form-label">
          App Name
        </label>
        <input
          id="appName"
          name="appName"
          type="text"
          required
          defaultValue={initialValues.appName ?? ""}
          className="form-control"
        />
      </div>

      <div className="form-group">
        <label htmlFor="description" className="form-label">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          className="form-control"
        />
      </div>

      {state.error ? (
        <div className="error-box" role="alert" style={{ margin: 0 }}>
          {state.error}
        </div>
      ) : null}

      <div>
        <PendingSubmitButton
          idleLabel="Check Repository"
          pendingLabel="Checking Repository..."
          statusText="Checking your repository for compatibility and preparing to import. This can take a moment."
          variant="primary-solid"
          title="Checks whether the repository is compatible with Azure publishing and begins setting it up in the portal"
        />
      </div>
    </form>
  );
}
