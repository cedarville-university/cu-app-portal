import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { publishToAzureAction } from "@/features/publishing/actions";
import { prepareExistingAppAction } from "@/features/repository-imports/actions";
import { saveGitHubUsernameAndGrantAccessAction } from "@/features/repositories/actions";
import { buildCodexHandoffPrompt, buildLocalCodexGitSetupPrompt } from "@/features/repositories/codex-handoff";
import { CopyCodexHandoffButton } from "@/features/repositories/copy-codex-handoff-button";
import { prisma } from "@/lib/db";

function isLocalSource(config: unknown) {
  return Boolean(
    config &&
      typeof config === "object" &&
      "localOnlySource" in config &&
      config.localOnlySource === true,
  );
}

function Step({
  number,
  title,
  complete = false,
  children,
}: {
  number: number;
  title: string;
  complete?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`wizard-step${complete ? " wizard-step--complete" : ""}`}>
      <div className="wizard-step__number" aria-hidden="true">{complete ? "✓" : number}</div>
      <div className="wizard-step__content">
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}

export default async function AppOnboardingPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const userId = await getCurrentUserIdOrNull();
  if (!userId) notFound();

  const isAdmin = await userHasAdminRole(userId);
  const app = await prisma.appRequest.findFirst({
    where: appAccessWhere(requestId, userId, isAdmin),
    include: { repositoryImport: true, user: { select: { githubUsername: true } } },
  });
  if (!app) notFound();

  if (app.publishStatus === "SUCCEEDED") {
    return (
      <main>
        <div className="success-box">
          <strong>{app.appName} is published.</strong> Your initial setup is complete.
        </div>
        <div style={{ marginTop: "1rem" }}>
          <Link className="btn btn--primary-solid" href={`/download/${app.id}`}>Open app details</Link>
        </div>
      </main>
    );
  }

  const imported = app.sourceOfTruth === "IMPORTED_REPOSITORY";
  const local = isLocalSource(app.submittedConfig);
  const repositoryReady = app.repositoryStatus === "READY" && Boolean(app.repositoryUrl);
  const accessReady = app.repositoryAccessStatus === "GRANTED" || app.repositoryAccessStatus === "INVITED";
  const prompt = repositoryReady && app.repositoryUrl
    ? local
      ? buildLocalCodexGitSetupPrompt({ repositoryUrl: app.repositoryUrl, appName: app.appName, requestId, defaultBranch: app.repositoryDefaultBranch })
      : buildCodexHandoffPrompt(app.repositoryUrl, app.appName, requestId)
    : null;
  const canPrepareImport = imported && !local && app.repositoryImport?.preparationStatus !== "COMMITTED";
  const canPublish = repositoryReady && (!imported || app.repositoryImport?.preparationStatus === "COMMITTED");

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link><span className="breadcrumb__sep" aria-hidden="true">/</span>
        <span aria-current="page">Set up {app.appName}</span>
      </nav>
      <div className="page-header">
        <p className="eyebrow">App setup guide</p>
        <h1>Set up {app.appName}</h1>
        <p>Complete these steps in order. We&rsquo;ll keep the technical setup in the background as much as possible.</p>
      </div>
      <ol className="wizard-progress" aria-label="Onboarding progress">
        <li className="wizard-progress__active">Repository</li><li>Code and access</li><li>Publish to Azure</li>
      </ol>

      <div className="wizard-steps">
        <Step number={1} title="Your GitHub repository" complete={repositoryReady}>
          {repositoryReady ? <p className="success-text">Your managed code repository is ready.</p> : <p>Repository setup is still in progress or needs attention. Open the app details page to retry it.</p>}
          {app.repositoryUrl ? <p><a href={app.repositoryUrl} target="_blank" rel="noreferrer">View repository on GitHub</a></p> : null}
        </Step>

        <Step number={2} title="Do you have a GitHub account?" complete={accessReady}>
          {accessReady ? <p className="success-text">Repository access is {app.repositoryAccessStatus === "GRANTED" ? "ready" : "on its way — accept the GitHub invitation to continue"}.</p> : repositoryReady ? (
            <>
              <p>Enter your GitHub username to receive access. Don&rsquo;t have an account yet? <a href="https://github.com/signup" target="_blank" rel="noreferrer">Create a free GitHub account</a>, then return here.</p>
              <form action={saveGitHubUsernameAndGrantAccessAction.bind(null, app.id)} className="wizard-inline-form">
                <input className="form-control" name="githubUsername" required placeholder="GitHub username" defaultValue={app.user.githubUsername ?? ""} />
                <PendingSubmitButton idleLabel="Send repository invite" pendingLabel="Sending invite..." statusText="Requesting your repository access." variant="secondary-solid" />
              </form>
            </>
          ) : <p>Finish repository setup first.</p>}
        </Step>

        <Step number={3} title={local ? "Connect your local code" : imported ? "Prepare your app for Azure" : "Customize your app with Codex"} complete={imported && !local && app.repositoryImport?.preparationStatus === "COMMITTED"}>
          {canPrepareImport ? (
            <>
              <p>The portal will inspect your code and add the Azure publishing files. It never replaces an existing publishing workflow without a review step.</p>
              <form action={prepareExistingAppAction.bind(null, app.id)}>
                <input type="hidden" name="preparationMode" value="DIRECT_COMMIT" />
                <PendingSubmitButton idleLabel="Prepare repository for Azure" pendingLabel="Preparing repository..." statusText="Checking your app and adding its publishing setup." variant="primary-solid" />
              </form>
            </>
          ) : prompt ? (
            <>
              <p>{local ? "Copy this prompt into Codex from your local app folder. Codex will connect the code to the managed repository." : "Copy this prompt into Codex when you are ready to make changes to your app."}</p>
              <pre className="wizard-prompt"><code>{prompt}</code></pre>
              <CopyCodexHandoffButton prompt={prompt} />
            </>
          ) : <p>Finish the earlier steps first.</p>}
        </Step>

        <Step number={4} title="Publish to Azure">
          {app.publishStatus === "QUEUED" || app.publishStatus === "PROVISIONING" || app.publishStatus === "DEPLOYING" ? <p className="success-text">Publishing is underway. You can monitor it from app details.</p> : app.publishStatus === "FAILED" ? <p>Publishing needs attention. Open app details to review the error and retry or repair setup.</p> : canPublish ? (
            <>
              <p>When your code is ready, the portal can publish it to Azure. This normally takes a few minutes.</p>
              <form action={publishToAzureAction.bind(null, app.id)}><PendingSubmitButton idleLabel="Publish to Azure" pendingLabel="Publishing to Azure..." statusText="Creating Azure resources and starting deployment." variant="primary-solid" /></form>
            </>
          ) : <p>Finish the repository and code preparation steps first.</p>}
        </Step>
      </div>
      <div className="wizard-footer"><Link href={`/download/${app.id}`}>Open full app details and advanced options</Link></div>
    </main>
  );
}
