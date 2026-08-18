import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import {
  deriveOnboardingState,
  type OnboardingPathChoice,
  type OnboardingStateInput,
} from "@/features/onboarding/state";
import { OnboardingProgressRefresh } from "@/features/onboarding/progress-refresh";
import { OnboardingStepShell } from "@/features/onboarding/step-shell";
import { publishToAzureAction } from "@/features/publishing/actions";
import { saveGitHubUsernameAndGrantAccessAction } from "@/features/repositories/actions";
import { parseRepositoryAccessActorUsername } from "@/features/repositories/access";
import {
  prepareExistingAppAction,
  verifyExistingAppPreparationAction,
} from "@/features/repository-imports/actions";
import {
  buildCodexHandoffPrompt,
  buildLocalCodexGitSetupPrompt,
  LOCAL_REPAIR_CONFIRMATION_LABEL,
  LOCAL_UPLOAD_CONFIRMATION_LABEL,
} from "@/features/repositories/codex-handoff";
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

function parsePathChoice(
  value: string | string[] | undefined,
): OnboardingPathChoice {
  return value === "starter" || value === "customize" ? value : null;
}

function parseAccountChoice(value: string | string[] | undefined) {
  return value === "existing" || value === "new" ? value : null;
}

function accountChoiceHref(
  requestId: string,
  pathChoice: OnboardingPathChoice,
  accountChoice: "existing" | "new",
) {
  const query = new URLSearchParams();
  if (pathChoice) query.set("path", pathChoice);
  query.set("account", accountChoice);
  return `/onboarding/${requestId}?${query.toString()}`;
}

function repositoryAccessStatusForActor({
  status,
  note,
  githubUsername,
}: {
  status: string;
  note: string | null;
  githubUsername: string | null;
}) {
  if (status !== "GRANTED" && status !== "INVITED" && status !== "FAILED") {
    return status;
  }
  if (!githubUsername) return "NOT_REQUESTED";

  const accessUsername = parseRepositoryAccessActorUsername(note);
  return accessUsername?.toLowerCase() === githubUsername.toLowerCase()
    ? status
    : "NOT_REQUESTED";
}

function PublishForm({
  requestId,
  label = "Publish to Azure",
}: {
  requestId: string;
  label?: string;
}) {
  return (
    <form action={publishToAzureAction.bind(null, requestId)}>
      <PendingSubmitButton
        idleLabel={label}
        pendingLabel="Publishing to Azure..."
        statusText="Creating the Azure home for your app and starting publication."
        variant="primary-solid"
      />
    </form>
  );
}

function PreparationForm({
  requestId,
  mode,
  label,
  pendingLabel,
  statusText,
}: {
  requestId: string;
  mode: "DIRECT_COMMIT" | "PULL_REQUEST";
  label: string;
  pendingLabel: string;
  statusText: string;
}) {
  return (
    <form action={prepareExistingAppAction.bind(null, requestId)}>
      <input type="hidden" name="preparationMode" value={mode} />
      <PendingSubmitButton
        idleLabel={label}
        pendingLabel={pendingLabel}
        statusText={statusText}
        variant="primary-solid"
      />
    </form>
  );
}

function GitHubUsernameForm({
  requestId,
  githubUsername,
  label = "Send repository invite",
}: {
  requestId: string;
  githubUsername: string | null;
  label?: string;
}) {
  return (
    <form
      action={saveGitHubUsernameAndGrantAccessAction.bind(null, requestId)}
      className="wizard-inline-form"
    >
      <label>
        GitHub username
        <input
          className="form-control"
          name="githubUsername"
          required
          autoComplete="username"
          defaultValue={githubUsername ?? ""}
        />
      </label>
      <PendingSubmitButton
        idleLabel={label}
        pendingLabel="Sending invite..."
        statusText="Requesting access to your app's private code home."
        variant="primary-solid"
      />
    </form>
  );
}

function ConfirmGitHubInvitationForm({
  requestId,
  githubUsername,
}: {
  requestId: string;
  githubUsername: string | null;
}) {
  return (
    <form action={saveGitHubUsernameAndGrantAccessAction.bind(null, requestId)}>
      <input
        type="hidden"
        name="githubUsername"
        value={githubUsername ?? ""}
      />
      <PendingSubmitButton
        idleLabel="I've accepted the invitation"
        pendingLabel="Checking GitHub access..."
        statusText="Asking GitHub to confirm your repository access."
        variant="primary-solid"
      />
    </form>
  );
}

function stateInputForApp(
  app: Prisma.AppRequestGetPayload<{
    include: { repositoryImport: true };
  }>,
  pathChoice: OnboardingPathChoice,
  repositoryAccessStatus: string,
): OnboardingStateInput {
  return {
    sourceOfTruth: app.sourceOfTruth,
    repositoryStatus: app.repositoryStatus,
    repositoryUrl: app.repositoryUrl,
    repositoryAccessStatus,
    importStatus: app.repositoryImport?.importStatus ?? null,
    preparationStatus: app.repositoryImport?.preparationStatus ?? null,
    preparationMode: app.repositoryImport?.preparationMode ?? null,
    compatibilityStatus: app.repositoryImport?.compatibilityStatus ?? null,
    publishingSetupStatus: app.publishingSetupStatus,
    publishStatus: app.publishStatus,
    isLocalSource: isLocalSource(app.submittedConfig),
    pathChoice,
  };
}

export default async function AppOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { requestId } = await params;
  const query = (await searchParams) ?? {};
  const userId = await getCurrentUserIdOrNull();
  if (!userId) notFound();

  const isAdmin = await userHasAdminRole(userId);
  const app = await prisma.appRequest.findFirst({
    where: appAccessWhere(requestId, userId, isAdmin),
    include: { repositoryImport: true },
  });
  if (!app) notFound();

  const currentActor = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubUsername: true },
  });
  if (!currentActor) notFound();

  const pathChoice = parsePathChoice(query.path);
  const accountChoice = parseAccountChoice(query.account);
  const repositoryAccessStatus = repositoryAccessStatusForActor({
    status: app.repositoryAccessStatus,
    note: app.repositoryAccessNote,
    githubUsername: currentActor.githubUsername,
  });
  const state = deriveOnboardingState(
    stateInputForApp(app, pathChoice, repositoryAccessStatus),
  );
  const repositoryDetails = app.repositoryUrl ? (
    <p>
      <a href={app.repositoryUrl} target="_blank" rel="noreferrer">
        Open your private code home on GitHub
      </a>
    </p>
  ) : undefined;

  if (state.kind === "IMPORT_FAILED" && app.repositoryImport) {
    const restartHref = `/apps/add?source=github&repositoryUrl=${encodeURIComponent(
      app.repositoryImport.sourceRepositoryUrl,
    )}&appName=${encodeURIComponent(app.appName)}`;

    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Code"
          title="We couldn't copy your app yet"
          explanation="The portal did not finish making a managed Cedarville copy. It left this request unchanged so it will not overwrite or delete any repository files."
          next="Start a new import from the original GitHub repository. The portal will choose a fresh managed repository name instead of reusing the partial copy."
          supportReference={app.supportReference}
        >
          <div className="wizard-actions">
            {app.repositoryImport.importErrorSummary ? (
              <p role="alert">{app.repositoryImport.importErrorSummary}</p>
            ) : null}
            <Link className="btn btn--primary-solid" href={restartHref}>
              Start again with this repository
            </Link>
          </div>
        </OnboardingStepShell>
      </main>
    );
  }

  if (state.kind === "GENERATED_PATH_CHOICE") {
    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Code"
          title="Your starter app is ready"
          explanation="You can publish the starter exactly as it is, or customize it first with Codex, an assistant that can make app changes for you. Publishing the starter does not require a GitHub account."
          next="Publishing puts the app online in Azure. Customizing first will guide you through access to its private code home."
          supportReference={app.supportReference}
          details={repositoryDetails}
        >
          <div className="wizard-actions">
            <PublishForm requestId={app.id} label="Publish the starter now" />
            <Link
              className="btn btn--secondary"
              href={`/onboarding/${app.id}?path=customize`}
            >
              Customize it with Codex first
            </Link>
          </div>
        </OnboardingStepShell>
      </main>
    );
  }

  if (state.kind === "GITHUB_ACCOUNT_REQUIRED") {
    let accountAction: React.ReactNode;

    if (currentActor.githubUsername || accountChoice === "existing") {
      accountAction = (
        <>
          {repositoryAccessStatus === "FAILED" && app.repositoryAccessNote ? (
            <p role="alert">{app.repositoryAccessNote}</p>
          ) : null}
          <GitHubUsernameForm
            requestId={app.id}
            githubUsername={currentActor.githubUsername}
            label={
              repositoryAccessStatus === "FAILED"
                ? "Try GitHub access again"
                : "Send repository invite"
            }
          />
        </>
      );
    } else if (accountChoice === "new") {
      accountAction = (
        <div className="wizard-actions">
          <a
            className="btn btn--primary-solid"
            href="https://github.com/signup"
            target="_blank"
            rel="noreferrer"
          >
            Create a GitHub account
          </a>
          <p>
            Return to this browser tab after GitHub confirms your new account.
            Then continue below.
          </p>
          <Link
            className="btn btn--secondary"
            href={accountChoiceHref(app.id, pathChoice, "existing")}
          >
            I created my account
          </Link>
        </div>
      );
    } else {
      accountAction = (
        <div className="wizard-actions">
          <Link
            className="btn btn--primary-solid"
            href={accountChoiceHref(app.id, pathChoice, "existing")}
          >
            I already have a GitHub account
          </Link>
          <Link
            className="btn btn--secondary"
            href={accountChoiceHref(app.id, pathChoice, "new")}
          >
            I need to create one
          </Link>
        </div>
      );
    }

    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Code"
          title="Give Codex access to your app code"
          explanation="GitHub is the private online home for your app's code. The portal needs your GitHub username so it can invite your signed-in account to that private home."
          next="After access is ready, the portal will give you one prompt to paste into Codex."
          supportReference={app.supportReference}
          details={repositoryDetails}
        >
          {accountAction}
        </OnboardingStepShell>
      </main>
    );
  }

  if (state.kind === "GITHUB_INVITATION_PENDING") {
    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Code"
          title="Accept your invitation to the app code"
          explanation="GitHub sent your signed-in account an invitation to this app's private online code home. Open GitHub, accept the invitation, and then ask the portal to check again."
          next="When GitHub confirms access, the portal will give you the Codex customization prompt."
          supportReference={app.supportReference}
        >
          <div className="wizard-actions">
            {app.repositoryUrl ? (
              <a
                className="btn btn--secondary"
                href={app.repositoryUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open your GitHub invitation
              </a>
            ) : null}
            <p>Accept the invitation on GitHub before continuing.</p>
            <ConfirmGitHubInvitationForm
              requestId={app.id}
              githubUsername={currentActor.githubUsername}
            />
          </div>
        </OnboardingStepShell>
      </main>
    );
  }

  if (state.kind === "CODEX_CUSTOMIZATION" && app.repositoryUrl) {
    const prompt = buildCodexHandoffPrompt(
      app.repositoryUrl,
      app.appName,
      app.id,
      { defaultBranch: app.repositoryDefaultBranch },
    );

    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Code"
          title="Customize your app with Codex"
          explanation="Codex is an assistant that can make and verify app changes for you. Open this app's managed repository in Codex, paste the prompt below, and let Codex handle the technical work."
          next="After Codex says the finished changes were pushed successfully, return here and publish the app to Azure."
          supportReference={app.supportReference}
          details={repositoryDetails}
        >
          <div className="wizard-actions">
            <pre className="wizard-prompt">
              <code>{prompt}</code>
            </pre>
            <CopyCodexHandoffButton prompt={prompt} />
            <p>
              Follow only the sign-in or invitation steps Codex cannot complete
              for you. Do not share passwords or secret values.
            </p>
            <PublishForm requestId={app.id} />
          </div>
        </OnboardingStepShell>
      </main>
    );
  }

  if (
    (state.kind === "LOCAL_CODE_UPLOAD" ||
      state.kind === "LOCAL_CODE_REPAIR") &&
    app.repositoryUrl
  ) {
    const isRepair = state.kind === "LOCAL_CODE_REPAIR";
    const prompt = buildLocalCodexGitSetupPrompt({
      repositoryUrl: app.repositoryUrl,
      appName: app.appName,
      requestId: app.id,
      defaultBranch: app.repositoryDefaultBranch,
      preparationErrorSummary: isRepair
        ? app.repositoryImport?.preparationErrorSummary
        : null,
    });

    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Code"
          title={
            isRepair
              ? "Repair and upload your local app with Codex"
              : "Upload your local app with Codex"
          }
          explanation={
            isRepair
              ? "The portal found that this app's current runtime cannot be prepared for publishing. Repair the app before confirming another upload. Paste the instructions into Codex so it can explain the portal feedback, update the app safely, test it, and upload the repaired code."
              : "Codex is an assistant that can connect the app folder on your computer to its private GitHub code home. Paste this prompt into Codex and let it handle the technical Git steps."
          }
          next={
            isRepair
              ? "Wait until Codex says the repair, tests, and upload all succeeded. Then confirm here so the portal can inspect the changed code again."
              : "Wait until Codex says the upload succeeded. Then return here and confirm the upload so the portal can check and prepare the app for publishing."
          }
          supportReference={app.supportReference}
          details={repositoryDetails}
        >
          <div className="wizard-actions">
            {isRepair && app.repositoryImport?.preparationErrorSummary ? (
              <p role="alert">
                {app.repositoryImport.preparationErrorSummary}
              </p>
            ) : null}
            <pre className="wizard-prompt">
              <code>{prompt}</code>
            </pre>
            <CopyCodexHandoffButton prompt={prompt} />
            <p>
              Do not select the confirmation until Codex reports that the push
              to the managed repository succeeded.
            </p>
            <PreparationForm
              requestId={app.id}
              mode="DIRECT_COMMIT"
              label={
                isRepair
                  ? LOCAL_REPAIR_CONFIRMATION_LABEL
                  : LOCAL_UPLOAD_CONFIRMATION_LABEL
              }
              pendingLabel="Checking my uploaded code..."
              statusText="Checking the uploaded app and adding the files needed for Azure publishing."
            />
          </div>
        </OnboardingStepShell>
      </main>
    );
  }

  if (state.kind === "PREPARATION_READY") {
    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Prepare"
          title="Prepare your app for publishing"
          explanation="The portal will inspect your app and add Cedarville's Azure publishing files. It will not overwrite publishing files that are already there."
          next="If there are no conflicts, the portal will finish the publishing setup. If existing files need a decision, it will guide you through a safe GitHub review."
          supportReference={app.supportReference}
          details={repositoryDetails}
        >
          <PreparationForm
            requestId={app.id}
            mode="DIRECT_COMMIT"
            label="Prepare my app for publishing"
            pendingLabel="Preparing my app..."
            statusText="Checking your app and adding the files needed for Azure publishing."
          />
        </OnboardingStepShell>
      </main>
    );
  }

  if (state.kind === "PREPARATION_RUNNING") {
    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Prepare"
          title="The portal is preparing your app"
          explanation="The portal is checking the app and adding the files Azure needs. No action is needed while this work is running."
          next="This page will move to the next safe step as soon as preparation finishes."
          supportReference={app.supportReference}
          details={repositoryDetails}
        >
          <OnboardingProgressRefresh statusText="The portal is checking your app automatically while preparation continues. You can leave this page open." />
        </OnboardingStepShell>
      </main>
    );
  }

  if (state.kind === "PREPARATION_FAILED") {
    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Prepare"
          title="Preparation needs another try"
          explanation="The app is still safe. The portal saved the preparation method you chose and will use that same method for this retry."
          next="Try again once. If the same message returns, share the support reference with the portal support team."
          supportReference={app.supportReference}
          details={repositoryDetails}
        >
          <div className="wizard-actions">
            {app.repositoryImport?.preparationErrorSummary ? (
              <p role="alert">
                {app.repositoryImport.preparationErrorSummary}
              </p>
            ) : null}
            <PreparationForm
              requestId={app.id}
              mode={state.retryMode}
              label="Try preparation again"
              pendingLabel="Trying preparation again..."
              statusText="Retrying the same safe preparation method used before."
            />
          </div>
        </OnboardingStepShell>
      </main>
    );
  }

  if (state.kind === "PREPARATION_CONFLICT") {
    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Prepare"
          title="Review existing publishing files safely"
          explanation="Your app already has publishing files, so the portal will not replace them directly. It can open a pull request, which is a proposed set of changes you can review on GitHub before anything is merged into the app."
          next="Open the safe review, compare the proposed files on GitHub, and merge them only when they look right. The wizard will then check that the approved files reached the app."
          supportReference={app.supportReference}
          details={repositoryDetails}
        >
          <div className="wizard-actions">
            {app.repositoryImport?.preparationErrorSummary ? (
              <p role="alert">
                {app.repositoryImport.preparationErrorSummary}
              </p>
            ) : null}
            <PreparationForm
              requestId={app.id}
              mode="PULL_REQUEST"
              label="Open a safe review on GitHub"
              pendingLabel="Opening the GitHub review..."
              statusText="Creating a proposed set of publishing changes for you to review on GitHub."
            />
          </div>
        </OnboardingStepShell>
      </main>
    );
  }

  if (state.kind === "PREPARATION_REVIEW_OPEN") {
    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Prepare"
          title="Review and approve the publishing changes"
          explanation="A pull request is a GitHub review page for proposed changes. Open it, review the files, approve the changes, and merge them into the app's main code before returning here."
          next="After you merge the pull request on GitHub, ask the portal to confirm that the publishing files are now part of the app."
          supportReference={app.supportReference}
          details={repositoryDetails}
        >
          <div className="wizard-actions">
            {app.repositoryImport?.preparationPullRequestUrl ? (
              <a
                className="btn btn--secondary"
                href={app.repositoryImport.preparationPullRequestUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open the GitHub review
              </a>
            ) : null}
            {app.repositoryImport?.preparationErrorSummary ? (
              <p role="alert">
                {app.repositoryImport.preparationErrorSummary}
              </p>
            ) : null}
            <form
              action={verifyExistingAppPreparationAction.bind(
                null,
                app.id,
                undefined,
              )}
            >
              <PendingSubmitButton
                idleLabel="I've approved the changes"
                pendingLabel="Checking the approved changes..."
                statusText="Checking that the reviewed publishing files were merged into the app."
                variant="primary-solid"
              />
            </form>
          </div>
        </OnboardingStepShell>
      </main>
    );
  }

  if (state.kind === "READY_TO_PUBLISH") {
    return (
      <main>
        <OnboardingStepShell
          appName={app.appName}
          currentStage="Publish"
          title="Your app is ready to publish"
          explanation="Azure is Cedarville's online hosting service for this app. Publishing creates its online home and starts the first release."
          next="The portal will show publishing progress and tell you when the app is online."
          supportReference={app.supportReference}
        >
          <PublishForm requestId={app.id} />
        </OnboardingStepShell>
      </main>
    );
  }

  return (
    <main>
      <OnboardingStepShell
        appName={app.appName}
        currentStage="Prepare"
        title="Your app setup is continuing"
        explanation="The portal has saved your progress and will guide the next available step here."
        next="Return to this page after the current setup work is complete."
        supportReference={app.supportReference}
        details={repositoryDetails}
      >
        <p role="status">Your setup is safe to leave here for now.</p>
      </OnboardingStepShell>
    </main>
  );
}
