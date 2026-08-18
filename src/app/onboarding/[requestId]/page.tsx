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
import { OnboardingStepShell } from "@/features/onboarding/step-shell";
import { publishToAzureAction } from "@/features/publishing/actions";
import { saveGitHubUsernameAndGrantAccessAction } from "@/features/repositories/actions";
import { parseRepositoryAccessActorUsername } from "@/features/repositories/access";
import { buildCodexHandoffPrompt } from "@/features/repositories/codex-handoff";
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
