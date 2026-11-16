"use client";

import React, { useActionState } from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { saveGitHubProfileAction, type GitHubProfileFormState } from "./github-profile-actions";

const initialState: GitHubProfileFormState = { error: null, username: "" };

export function GitHubProfileForm({ returnTo }: { returnTo: string }) {
  const [state, action, pending] = useActionState(saveGitHubProfileAction, initialState);
  return (
    <form action={action} className="form-stack github-profile-form">
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="form-stack" htmlFor="github-username">
        <span>GitHub username</span>
        <input
          id="github-username"
          className="form-control"
          name="githubUsername"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.username}
          required
          maxLength={39}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "github-username-help github-username-error" : "github-username-help"}
        />
      </label>
      <p id="github-username-help" className="form-help">
        Use your GitHub account name, not your email address or display name.
      </p>
      {state.error ? <p id="github-username-error" role="alert" className="error-box">{state.error}</p> : null}
      <PendingSubmitButton
        idleLabel="Save and continue"
        pendingLabel="Saving..."
        statusText="Saving your GitHub username."
        pending={pending}
      />
    </form>
  );
}
