import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { createManagedRepositoryForLocalAppAction } from "@/features/repository-imports/actions";
import { AddExistingAppForm } from "@/features/repository-imports/add-existing-app-form";

type SourcePath = "github" | "local" | null;

function getSourcePath(value: string | string[] | undefined): SourcePath {
  const source = Array.isArray(value) ? value[0] : value;

  return source === "github" || source === "local" ? source : null;
}

async function submitLocalCodexAppAction(formData: FormData) {
  "use server";

  const result = await createManagedRepositoryForLocalAppAction(formData);
  redirect(`/onboarding/${result.requestId}`);
}

export default async function AddExistingAppPage({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string | string[];
    repositoryUrl?: string | string[];
    appName?: string | string[];
  }>;
}) {
  const userId = await getCurrentUserIdOrNull();
  const { source, repositoryUrl, appName } = await searchParams;
  const selectedSource = getSourcePath(source);
  const initialRepositoryUrl = Array.isArray(repositoryUrl)
    ? repositoryUrl[0]
    : repositoryUrl;
  const initialAppName = Array.isArray(appName) ? appName[0] : appName;
  const githubInitialValues = {
    repositoryUrl: initialRepositoryUrl,
    appName: initialAppName,
  };

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
          Bring your app into the portal so it can help you put it online when
          you&rsquo;re ready. If your app is already saved online, use its web
          address. If the files are only on your computer, start by creating a
          private online space for them.
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
            GitHub is a secure website where app files can be saved, shared,
            and updated over time.
          </p>
          <p style={{ marginTop: "0.625rem" }}>
            In GitHub, the online folder that holds an app is called a
            repository. The portal uses one shared online copy so people and
            tools can work from the same files instead of passing files around.
          </p>
        </div>
      </details>

      <div style={{ display: "grid", gap: "1.25rem", maxWidth: "760px" }}>
        {selectedSource !== "local" ? (
          <div className="card">
            {selectedSource === "github" ? <p className="eyebrow" aria-current="step">Current step</p> : null}
          <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>
            Already on GitHub
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
            GitHub is a secure website where app files can be saved online.
            Paste your app&rsquo;s web address. The portal will check it, then make
            the Cedarville copy needed to help put it online.
          </p>
          <details className="card" style={{ marginBottom: "1rem", padding: "0.75rem 1rem" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              What kinds of apps can I add?
            </summary>
            <p style={{ marginTop: "0.75rem", color: "var(--text-secondary)" }}>
              For people who work with code: the portal recognizes root Next.js
              apps, Express apps, Python FastAPI apps, and plain static Python
              apps with a root index.html for Azure App Service publishing.
            </p>
          </details>
          <AddExistingAppForm initialValues={githubInitialValues} />
          </div>
        ) : null}

        <div className="card card--gold-border">
          {selectedSource === "local" ? <p className="eyebrow" aria-current="step">Current step</p> : null}
          <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>
            Only on my computer
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
            The portal will create an empty online home for your app first. On
            the next page, follow simple steps to add your local app to that
            home.
          </p>
          <form id="local-app" action={submitLocalCodexAppAction} className="form-stack">
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
                idleLabel="Create online home"
                pendingLabel="Creating online home..."
                statusText="Creating a private online space for your app."
                variant="primary-solid"
                title="Creates a private online space, then shows steps for adding your app files"
              />
            </div>
          </form>
        </div>

        {selectedSource === "local" ? (
          <div className="card">
            <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>
              Already on GitHub
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              GitHub is a secure website where app files can be saved online.
              Paste your app&rsquo;s web address. The portal will check it, then make
              the Cedarville copy needed to help put it online.
            </p>
            <details className="card" style={{ marginBottom: "1rem", padding: "0.75rem 1rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                What kinds of apps can I add?
              </summary>
              <p style={{ marginTop: "0.75rem", color: "var(--text-secondary)" }}>
                For people who work with code: the portal recognizes root Next.js
                apps, Express apps, Python FastAPI apps, and plain static Python
                apps with a root index.html for Azure App Service publishing.
              </p>
            </details>
            <AddExistingAppForm initialValues={githubInitialValues} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
