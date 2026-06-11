import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import {
  addExistingAppAction,
  createManagedRepositoryForLocalAppAction,
} from "@/features/repository-imports/actions";

async function submitExistingAppAction(formData: FormData) {
  "use server";

  const result = await addExistingAppAction(formData);
  redirect(`/download/${result.requestId}`);
}

async function submitLocalCodexAppAction(formData: FormData) {
  "use server";

  const result = await createManagedRepositoryForLocalAppAction(formData);
  redirect(`/download/${result.requestId}`);
}

export default async function AddExistingAppPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <Link href="/apps">My Apps</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page">Add Existing App</span>
      </nav>

      <div className="page-header">
        <h1>Add Existing App</h1>
        <p>
          Connect app code so the portal can handle Azure publishing for it.
          Use an existing GitHub repository, or let the portal create a managed
          repository first and give Codex the setup steps for your local app.
        </p>
      </div>

      <details
        className="card"
        style={{
          maxWidth: "760px",
          marginBottom: "1.25rem",
          padding: "1rem 1.125rem",
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          What is GitHub?
        </summary>
        <div
          style={{
            marginTop: "0.75rem",
            color: "var(--text-secondary)",
            fontSize: "0.9375rem",
          }}
        >
          <p>
            GitHub is a secure place to store app code, keep track of changes,
            and share work with the people and tools that need access.
          </p>
          <p style={{ marginTop: "0.625rem" }}>
            The portal uses GitHub so Codex, Cedarville reviewers, and Azure
            publishing can all work from the same managed repository instead of
            passing files around manually.
          </p>
        </div>
      </details>

      <div style={{ display: "grid", gap: "1.25rem", maxWidth: "760px" }}>
        <div className="card">
          <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>
            Already on GitHub
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
            Paste the repository URL and the portal will copy it into the managed
            Cedarville org when needed. The portal currently detects root Next.js
            and Python FastAPI apps for Azure App Service publishing.
          </p>
          <form action={submitExistingAppAction} className="form-stack">
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
                className="form-control"
              />
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.375rem" }}>
                The web address of the repository — looks like <code>https://github.com/your-org/your-repo</code>
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
        </div>

        <div className="card card--gold-border">
          <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>
            Not on GitHub Yet
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
            The portal will create an empty managed GitHub repository first. On
            the next page, copy the Codex instructions so Codex can initialize
            git in your local app, add the managed repository as a remote, and
            push your code.
          </p>
          <form action={submitLocalCodexAppAction} className="form-stack">
            <div className="form-group">
              <label htmlFor="localAppName" className="form-label">
                Local App Name
              </label>
              <input
                id="localAppName"
                name="appName"
                type="text"
                required
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label htmlFor="localDescription" className="form-label">
                Local App Description
              </label>
              <textarea
                id="localDescription"
                name="description"
                rows={4}
                className="form-control"
              />
            </div>

            <div>
              <PendingSubmitButton
                idleLabel="Create Managed Repository"
                pendingLabel="Creating Repository..."
                statusText="Creating a managed GitHub repository for your local Codex app."
                variant="primary-solid"
                title="Creates an empty managed repository and then shows Codex instructions for pushing your local app code"
              />
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
