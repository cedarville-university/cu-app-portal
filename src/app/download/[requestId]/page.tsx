import { AppHealthPanel } from "@/features/app-details/app-health-panel";
import { savedImportedFeatures } from "@/features/repository-imports/features";
import { getAppPageMetadata } from "@/features/navigation/page-metadata";
import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type {
  PublishStatus,
  PublishingSetupStatus,
  RepositoryPreparationStatus,
  RepositoryStatus,
  SourceOfTruth,
} from "@prisma/client";
import {
  appAccessWhere,
  userHasAdminRole,
} from "@/features/app-requests/access";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import {
  enablePushToDeployAction,
  disablePushToDeployAction,
  publishToAzureAction,
  retryPublishAction,
} from "@/features/publishing/actions";
import {
  getPublishEligibility,
  getPublishingSetupRepairEligibility,
} from "@/features/publishing/eligibility";
import { ConfirmDeleteForm } from "@/features/app-deletion/confirm-delete-form";
import { deleteAppFormAction } from "@/features/app-deletion/actions";
import { repairPublishingSetupAction } from "@/features/publishing/setup/actions";
import { getEffectivePublishingSetupStatus } from "@/features/publishing/setup/status";
import { supportsPostSuccessPushToDeploy } from "@/features/publishing/providers";
import {
  retryRepositoryBootstrapAction,
  saveGitHubUsernameAndGrantAccessAction,
} from "@/features/repositories/actions";
import { resolveRepositoryAccessForActor } from "@/features/repositories/actor-access";
import {
  prepareExistingAppAction,
  verifyExistingAppPreparationAction,
} from "@/features/repository-imports/actions";
import { removeAppCollaboratorAction } from "@/features/collaboration-invites/actions";
import { CollaborationInvitePanel } from "@/features/collaboration-invites/invite-panel";
import { EnvVarsPanel } from "@/features/env-vars/env-vars-panel";
import { AppReadinessChecklist } from "@/features/app-details/app-readiness-checklist";
import { AppDetailsSectionLayout } from "@/features/app-details/section-layout";
import { appDetailsSectionHref, getAppDetailsSection } from "@/features/app-details/sections";
import { McpConnectionCard } from "@/features/app-details/mcp-connection-card";
import { buildMcpConnectionSummary } from "@/features/mcp-servers/connection-summary";
import { SecurityReviewPanel } from "@/features/security-review/panel";
import { LiveSecurityReview } from "@/features/security-review/live-review";
import { enrolledRepository } from "@/features/security-review/update-service";
import { applySecurityUpdate } from "@/features/security-review/update-action";
import { ownerSecurityReview } from "@/features/security-review/owner-results";
import { LoginUpdateNotice } from "@/features/app-details/login-update-notice";
import { getLoginUpdateFramework } from "@/features/app-details/login-update";
import { getImportedLoginReview, needsImportedLoginReview } from "@/features/repository-imports/login-review";
import { buildImportedLoginReviewPrompt } from "@/features/repository-imports/import-login-guidance";
import { LoginReviewPanel } from "@/features/repository-imports/login-review-panel";
import { PublicListingPanel } from "@/features/public-apps/public-listing-panel";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import {
  buildCodexHandoffPrompt,
  buildLocalCodexGitSetupPrompt,
  buildLoginUpdatePrompt,
} from "@/features/repositories/codex-handoff";
import { CopyCodexHandoffButton } from "@/features/repositories/copy-codex-handoff-button";
import { CodexPreparationChecklist } from "@/features/repositories/codex-preparation-checklist";
import { prisma } from "@/lib/db";

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

type BadgeVariant = "success" | "error" | "warning" | "info" | "default";

function publishBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "SUCCEEDED":
      return { label: "Published", variant: "success" };
    case "FAILED":
      return { label: "Publish failed", variant: "error" };
    case "QUEUED":
    case "PROVISIONING":
    case "DEPLOYING":
      return { label: "Publishing", variant: "info" };
    case "DELETED":
      return { label: "Deleted", variant: "default" };
    default:
      return { label: "Not published", variant: "default" };
  }
}

function getDisplayPublishUrl(
  primaryPublishUrl: string | null,
  publishUrl: string | null,
) {
  return publishUrl ?? primaryPublishUrl;
}

function formatDeploymentMode(mode: string | null | undefined) {
  return mode === "PUSH_TO_DEPLOY" ? "auto-deploy" : "manual publish";
}

function deploymentModeTooltip(mode: string | null | undefined) {
  return mode === "PUSH_TO_DEPLOY"
    ? "Your app publishes to Azure automatically whenever code is updated in the repository."
    : "You control when your app is published to Azure by clicking the Publish button here.";
}

const PREPARATION_REQUIRED_MESSAGE =
  "Publishing is unavailable until the publishing setup has been applied to your repository.";
const SETUP_REPAIR_REQUIRED_MESSAGE =
  "Publishing setup needs to be repaired before you can publish.";
const SETUP_READY_REQUIRED_MESSAGE =
  "Publishing setup must be ready before you can publish.";

function isImportedRepositoryPrepared(
  sourceOfTruth: string,
  preparationStatus: string | null | undefined,
) {
  return (
    sourceOfTruth !== "IMPORTED_REPOSITORY" || preparationStatus === "COMMITTED"
  );
}

function isPublishingSetupBlocking(status: string | null | undefined) {
  return (
    status === "NEEDS_REPAIR" ||
    status === "REPAIRING" ||
    status === "BLOCKED"
  );
}

function canPublishWithSetup(
  sourceOfTruth: string | null | undefined,
  publishingSetupStatus: string | null | undefined,
) {
  const status = publishingSetupStatus ?? "NOT_CHECKED";

  if (sourceOfTruth === "IMPORTED_REPOSITORY") {
    return status === "READY";
  }

  return status === "NOT_CHECKED" || status === "READY";
}

function getPublishingSetupBlockMessage(
  sourceOfTruth: string | null | undefined,
  publishingSetupStatus: string | null | undefined,
) {
  if (isPublishingSetupBlocking(publishingSetupStatus)) {
    return SETUP_REPAIR_REQUIRED_MESSAGE;
  }

  if (!canPublishWithSetup(sourceOfTruth, publishingSetupStatus)) {
    return SETUP_READY_REQUIRED_MESSAGE;
  }

  return null;
}

function renderUserIdentity(user: {
  displayName: string;
  email: string;
}) {
  return (
    <>
      <strong>{user.displayName}</strong>
      <span style={{ color: "var(--text-secondary)" }}>{user.email}</span>
    </>
  );
}

function renderAppAccessSummary({
  owner,
  collaborators,
  canManageCollaborators,
  appRequestId,
}: {
  owner?: {
    displayName: string;
    email: string;
  } | null;
  collaborators?: Array<{
    user: {
      id: string;
      displayName: string;
      email: string;
    };
  }>;
  canManageCollaborators?: boolean;
  appRequestId?: string;
}) {
  if (!owner) {
    return null;
  }

  return (
    <section aria-label="App access" className="card">
      <h3 className="section-title">App access</h3>
      <div className="status-table">
        <div className="status-row">
          <span className="status-row__label">Owner</span>
          <span
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.125rem",
            }}
          >
            {renderUserIdentity(owner)}
          </span>
        </div>
        <div className="status-row">
          <span className="status-row__label">Collaborators</span>
          {collaborators?.length ? (
            <ul
              style={{
                display: "grid",
                gap: "0.5rem",
                listStyle: "none",
                margin: 0,
                padding: 0,
              }}
            >
              {collaborators.map((collaborator) => (
                <li
                  key={collaborator.user.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.125rem",
                      minWidth: 0,
                    }}
                  >
                    {renderUserIdentity(collaborator.user)}
                  </span>
                  {canManageCollaborators && appRequestId ? (
                    <form
                      action={removeAppCollaboratorAction.bind(
                        null,
                        appRequestId,
                        collaborator.user.id,
                      )}
                    >
                      <PendingSubmitButton
                        idleLabel="Remove"
                        pendingLabel="Removing..."
                        statusText="Removing collaborator."
                        variant="danger"
                        size="sm"
                        ariaLabel={`Remove collaborator ${collaborator.user.displayName}`}
                      />
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <span style={{ color: "var(--text-secondary)" }}>
              No collaborators yet.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

const CHECK_KEY_LABELS: Record<string, string> = {
  azure_resource_access: "Azure hosting access",
  azure_app_settings: "Azure app configuration",
  entra_redirect_uri: "Login configuration",
  github_federated_credential: "GitHub publish identity",
  github_actions_secrets: "GitHub publish secrets",
  github_workflow_file: "GitHub workflow file",
  github_workflow_dispatch: "GitHub workflow trigger",
};

function formatCheckKey(key: string) {
  return CHECK_KEY_LABELS[key] ?? formatStatus(key);
}

function renderPublishingSetupStatus(request: {
  id: string;
  repositoryStatus: RepositoryStatus;
  sourceOfTruth: SourceOfTruth;
  preparationStatus?: RepositoryPreparationStatus | null;
  publishStatus?: PublishStatus | null;
  publishingSetupStatus?: PublishingSetupStatus | null;
}) {
  const status = getEffectivePublishingSetupStatus({
    publishStatus: request.publishStatus,
    publishingSetupStatus: request.publishingSetupStatus,
  });
  const repairAction = repairPublishingSetupAction.bind(null, request.id);
  const setupActionEligibility = getPublishingSetupRepairEligibility({
    repositoryStatus: request.repositoryStatus,
    sourceOfTruth: request.sourceOfTruth,
    preparationStatus: request.preparationStatus,
    publishStatus: request.publishStatus ?? "NOT_STARTED",
    publishingSetupStatus: status,
  });

  return (
    <section aria-label="Publishing setup status" className="setup-status">
      <h3 className="setup-status__title">Publishing setup</h3>
      <p>Status: {formatStatus(status)}</p>
      {setupActionEligibility.eligible &&
      request.publishStatus !== "FAILED" &&
      !(request.publishStatus === "SUCCEEDED" && status === "READY") ? (
        <form action={repairAction}>
          <PendingSubmitButton
            idleLabel="Repair Publishing Setup"
            pendingLabel="Repairing Publishing Setup..."
            statusText="Refreshing your Azure hosting, Microsoft login, and GitHub publishing settings."
            variant="primary-solid"
            size="sm"
            title="Attempts to automatically fix the publishing configuration so your app can be deployed to Azure"
          />
        </form>
      ) : null}
      {!setupActionEligibility.eligible &&
      setupActionEligibility.reason === "PUBLISHING_SETUP_IN_PROGRESS" ? (
        <div className="info-box">
          <p>
            A publishing check is still running. Your saved app is safe, and
            another publish or repair should not start until it finishes.
          </p>
          <Link href={`/onboarding/${request.id}`}>View publishing progress</Link>
        </div>
      ) : null}
    </section>
  );
}

function getImportedRepositoryRemoteWorkflow({
  repositoryImport,
  repositoryUrl,
  repositoryDefaultBranch,
}: {
  repositoryImport: {
    importStatus?: string | null;
    sourceRepositoryUrl?: string | null;
  } | null;
  repositoryUrl: string | null;
  repositoryDefaultBranch?: string | null;
}) {
  if (
    !repositoryUrl ||
    repositoryImport?.importStatus !== "SUCCEEDED" ||
    !repositoryImport.sourceRepositoryUrl
  ) {
    return null;
  }

  const defaultBranch = repositoryDefaultBranch ?? "main";

  return {
    defaultBranch,
    portalRepositoryUrl: repositoryUrl,
    sourceRepositoryUrl: repositoryImport.sourceRepositoryUrl,
  };
}

function isLocalCodexSource(submittedConfig: unknown) {
  if (!submittedConfig || typeof submittedConfig !== "object") {
    return false;
  }

  return (
    "localOnlySource" in submittedConfig &&
    submittedConfig.localOnlySource === true
  );
}

function getAppAudience(submittedConfig: unknown) {
  if (!submittedConfig || typeof submittedConfig !== "object") {
    return "not-recorded" as const;
  }

  if ("entraLogin" in submittedConfig) {
    return submittedConfig.entraLogin === true ? "cedarville" : "public";
  }

  return "not-recorded" as const;
}

function renderLocalCodexSetup({
  repositoryUrl,
}: {
  repositoryUrl: string | null;
}) {
  if (!repositoryUrl) {
    return null;
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>
        Use your existing app folder
      </h2>
      <p>
        Create a local Codex project using the folder that already contains
        your app, make it the primary folder, and paste the complete prompt
        under Your Code Repository into a task inside that project. Codex will
        inspect the folder, protect existing version history, and safely send
        the app to the managed repository at{" "}
        <a href={repositoryUrl} target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </p>
      <p>
        Let Codex handle the Git commands. Complete only a secure browser or
        operating-system sign-in if Codex asks. Never paste a password, access
        token, or SSH key into Codex.
      </p>
    </div>
  );
}

function renderImportedRepositoryStatus({
  requestId,
  repositoryImport,
  showProviderDiagnostics = false,
}: {
  requestId: string;
  repositoryImport: {
    sourceRepositoryUrl?: string | null;
    importStatus?: string | null;
    importErrorSummary?: string | null;
    compatibilityStatus?: string | null;
    preparationMode?: string | null;
    preparationStatus?: string | null;
    preparationPullRequestUrl?: string | null;
    preparationErrorSummary?: string | null;
  } | null;
  showProviderDiagnostics?: boolean;
}) {
  if (!repositoryImport) {
    return null;
  }

  const prepareAction = prepareExistingAppAction.bind(null, requestId);
  const verifyAction = verifyExistingAppPreparationAction.bind(
    null,
    requestId,
    undefined,
  );
  const hasPublishingFileConflict =
    repositoryImport.preparationStatus === "BLOCKED" &&
    repositoryImport.compatibilityStatus === "CONFLICTED";
  const retryPreparationMode =
    repositoryImport.preparationMode === "DIRECT_COMMIT" ||
    repositoryImport.preparationMode === "PULL_REQUEST"
      ? repositoryImport.preparationMode
      : null;
  const canRetryPreparation =
    repositoryImport.preparationStatus === "FAILED" &&
    retryPreparationMode !== null;
  const canVerifyReadiness =
    repositoryImport.preparationStatus === "PULL_REQUEST_OPENED" ||
    hasPublishingFileConflict;

  return (
    <section
      aria-label="Imported repository status"
      className="card"
    >
      <p className="section-title">Publishing Setup Status</p>
      <div className="status-table" style={{ marginBottom: "1rem" }}>
        {repositoryImport.sourceRepositoryUrl ? (
          <p>Original repository: {repositoryImport.sourceRepositoryUrl}</p>
        ) : null}
        {repositoryImport.importStatus ? (
          <p>Copy status: {formatStatus(repositoryImport.importStatus)}</p>
        ) : null}
        {showProviderDiagnostics && repositoryImport.importErrorSummary ? (
          <p>Copy error: {repositoryImport.importErrorSummary}</p>
        ) : null}
        {repositoryImport.compatibilityStatus ? (
          <p>
            Compatibility: {formatStatus(repositoryImport.compatibilityStatus)}
          </p>
        ) : null}
        {repositoryImport.preparationStatus ? (
          <p>Publishing setup: {formatStatus(repositoryImport.preparationStatus)}</p>
        ) : null}
        {repositoryImport.preparationPullRequestUrl ? (
          <p>
            Review link:{" "}
            <a href={repositoryImport.preparationPullRequestUrl}>
              {repositoryImport.preparationPullRequestUrl}
            </a>
          </p>
        ) : null}
        {showProviderDiagnostics && repositoryImport.preparationErrorSummary ? (
          <p>Setup error: {repositoryImport.preparationErrorSummary}</p>
        ) : null}
      </div>
      {hasPublishingFileConflict ? (
        <div className="warning-box" style={{ marginBottom: "1rem" }}>
          Your repository already contains publishing configuration files.
          CU Launch can open a review page on GitHub so you can approve the
          changes, or you can resolve them manually and confirm readiness here.
        </div>
      ) : null}
      {repositoryImport.preparationStatus === "PENDING_USER_CHOICE" ? (
        <div
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
        >
          <form action={prepareAction}>
            <input
              name="preparationMode"
              type="hidden"
              value="DIRECT_COMMIT"
            />
            <PendingSubmitButton
              idleLabel="Apply Publishing Setup"
              pendingLabel="Applying Publishing Setup..."
              statusText="Saving publishing configuration to your repository. This can take a moment."
              variant="primary-solid"
              size="sm"
              title="Saves the publishing configuration files directly to your repository so Azure can deploy your app"
            />
          </form>
          <form action={prepareAction}>
            <input name="preparationMode" type="hidden" value="PULL_REQUEST" />
            <PendingSubmitButton
              idleLabel="Review Publishing Changes"
              pendingLabel="Opening review page..."
              statusText="Opening a review page on GitHub. This can take a moment."
              variant="ghost"
              size="sm"
              title="Opens a page on GitHub where you can review and approve the publishing configuration changes before they're applied"
            />
          </form>
        </div>
      ) : null}
      {hasPublishingFileConflict ? (
        <form action={prepareAction}>
          <input name="preparationMode" type="hidden" value="PULL_REQUEST" />
          <PendingSubmitButton
            idleLabel="Review Publishing Changes"
            pendingLabel="Opening review page..."
            statusText="Opening a review page on GitHub. This can take a moment."
            variant="primary-solid"
            size="sm"
            title="Opens a page on GitHub where you can review and approve the publishing configuration changes before they're applied"
          />
        </form>
      ) : null}
      {canRetryPreparation ? (
        <form action={prepareAction}>
          <input
            name="preparationMode"
            type="hidden"
            value={retryPreparationMode ?? ""}
          />
          <PendingSubmitButton
            idleLabel="Retry Publishing Setup"
            pendingLabel="Retrying Publishing Setup..."
            statusText="Retrying publishing setup. This can take a moment."
            variant="primary-solid"
            size="sm"
          />
        </form>
      ) : null}
      {canVerifyReadiness ? (
        <form action={verifyAction}>
          <PendingSubmitButton
            idleLabel={
              hasPublishingFileConflict
                ? "Confirm Repository is Ready"
                : "Confirm Changes Were Merged"
            }
            pendingLabel="Checking..."
            statusText="Checking the repository for required publishing files."
            variant="ghost"
            size="sm"
            title={
              hasPublishingFileConflict
                ? "Check whether the conflicts in your repository have been resolved manually"
                : "Check whether the publishing changes you approved on GitHub have been merged"
            }
          />
        </form>
      ) : null}
    </section>
  );
}

function renderPublishAction({
  requestId,
  publishStatus,
  repositoryStatus,
  sourceOfTruth,
  preparationStatus,
  publishingSetupStatus,
}: {
  requestId: string;
  publishStatus: PublishStatus;
  repositoryStatus: RepositoryStatus;
  sourceOfTruth: SourceOfTruth;
  preparationStatus: RepositoryPreparationStatus | null | undefined;
  publishingSetupStatus: PublishingSetupStatus | null | undefined;
}) {
  if (repositoryStatus === "FAILED") {
    const retryAction = retryRepositoryBootstrapAction.bind(null, requestId);
    return (
      <form action={retryAction}>
        <PendingSubmitButton
          idleLabel="Retry Repository Setup"
          pendingLabel="Retrying Repository Setup…"
          statusText="Retrying repository setup. This can take a moment."
          variant="primary"
        />
      </form>
    );
  }

  if (repositoryStatus !== "READY") return null;

  if (!isImportedRepositoryPrepared(sourceOfTruth, preparationStatus)) {
    return <p>{PREPARATION_REQUIRED_MESSAGE}</p>;
  }

  if (publishStatus === "FAILED") {
    const retryAction = retryPublishAction.bind(null, requestId);
    const repairAction = repairPublishingSetupAction.bind(null, requestId);
    const eligibilityInput = {
      repositoryStatus,
      sourceOfTruth,
      preparationStatus,
      publishStatus,
      publishingSetupStatus: publishingSetupStatus ?? "NOT_CHECKED",
    };
    const retryEligibility = getPublishEligibility(eligibilityInput, {
      allowedPublishStatuses: ["FAILED"],
      allowFailedSetupRetry: true,
    });
    const setupActionEligibility =
      getPublishingSetupRepairEligibility(eligibilityInput);

    if (
      !retryEligibility.eligible &&
      retryEligibility.reason === "PUBLISHING_SETUP_IN_PROGRESS"
    ) {
      return null;
    }

    if (!retryEligibility.eligible && !setupActionEligibility.eligible) {
      return (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
          Publishing recovery is not available from this saved state. Open the
          guided progress page for the next safe step.
        </p>
      );
    }

    return (
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        {retryEligibility.eligible ? (
          <form action={retryAction}>
            <PendingSubmitButton
              idleLabel="Retry Publish"
              pendingLabel="Retrying Publish…"
              statusText="Retrying publish to Azure…"
              variant="primary-solid"
              title="Starts a new Azure deployment now and refreshes CU Launch-managed publishing credentials if needed"
            />
          </form>
        ) : null}
        {setupActionEligibility.eligible ? (
          <form action={repairAction}>
            <PendingSubmitButton
              idleLabel="Repair Publishing Setup"
              pendingLabel="Repairing Publishing Setup..."
              statusText="Refreshing your Azure hosting, Microsoft login, and GitHub publishing settings."
              variant="ghost"
              title="Refreshes publishing credentials and settings without starting an Azure deployment"
            />
          </form>
        ) : null}
      </div>
    );
  }

  const setupBlockMessage = getPublishingSetupBlockMessage(
    sourceOfTruth,
    publishingSetupStatus,
  );

  if (setupBlockMessage) {
    return (
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
        {setupBlockMessage}
      </p>
    );
  }

  if (publishStatus === "NOT_STARTED" || publishStatus === "SUCCEEDED") {
    const publishAction = publishToAzureAction.bind(null, requestId);
    return (
      <form action={publishAction}>
        <PendingSubmitButton
          idleLabel="Publish to Azure"
          pendingLabel="Publishing to Azure…"
          statusText="Publishing to Azure. This can take a few minutes."
          variant="primary-solid"
        />
      </form>
    );
  }

  return (
    <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
      Publish is in progress — check back shortly.
    </p>
  );
}

function renderPublishedRecoveryActions({
  requestId,
  sourceOfTruth,
  repositoryStatus,
  preparationStatus,
  publishingSetupStatus,
}: {
  requestId: string;
  sourceOfTruth: SourceOfTruth;
  repositoryStatus: RepositoryStatus;
  preparationStatus: RepositoryPreparationStatus | null | undefined;
  publishingSetupStatus: PublishingSetupStatus | null | undefined;
}) {
  const eligibilityInput = {
    repositoryStatus,
    sourceOfTruth,
    preparationStatus,
    publishStatus: "SUCCEEDED" as const,
    publishingSetupStatus: publishingSetupStatus ?? "NOT_CHECKED",
  };
  const retryEligibility = getPublishEligibility(eligibilityInput, {
    allowedPublishStatuses: ["SUCCEEDED"],
  });
  // A blocking setup status already exposes repair in the main publishing panel.
  const canRepair = publishingSetupStatus === "READY" &&
    getPublishingSetupRepairEligibility(eligibilityInput).eligible;

  if (!retryEligibility.eligible && !canRepair) return null;

  return (
    <details className="card app-details__disclosure">
      <summary>Repair or retry publishing</summary>
      <div className="app-details__disclosure-content">
        <p>Refresh publishing setup or start another Azure deployment.</p>
        <div className="app-details__actions">
          {canRepair ? (
            <form action={repairPublishingSetupAction.bind(null, requestId)}>
              <PendingSubmitButton
                idleLabel="Repair Publishing Setup"
                pendingLabel="Repairing Publishing Setup..."
                statusText="Refreshing your Azure hosting, Microsoft login, and GitHub publishing settings."
                variant="ghost"
                title="Refreshes publishing credentials and settings without starting an Azure deployment"
              />
            </form>
          ) : null}
          {retryEligibility.eligible ? (
            <form action={publishToAzureAction.bind(null, requestId)}>
              <PendingSubmitButton
                idleLabel="Retry Publish"
                pendingLabel="Retrying Publish…"
                statusText="Retrying publish to Azure…"
                variant="primary"
                title="Starts a new Azure deployment now"
              />
            </form>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function renderPushToDeployButton(request: {
  id: string;
  sourceOfTruth?: string | null;
  repositoryStatus: string;
  publishStatus: string;
  deploymentTarget?: string | null;
  deploymentTriggerMode?: string | null;
}) {
  if (
    !["PORTAL_MANAGED_REPO", "IMPORTED_REPOSITORY"].includes(
      request.sourceOfTruth ?? "",
    ) ||
    ["QUEUED", "PROVISIONING", "DEPLOYING"].includes(request.publishStatus) ||
    request.repositoryStatus !== "READY" ||
    !request.deploymentTarget ||
    !supportsPostSuccessPushToDeploy(request.deploymentTarget)
  ) {
    return null;
  }

  const enabled = request.deploymentTriggerMode === "PUSH_TO_DEPLOY";
  if (!enabled && request.publishStatus !== "SUCCEEDED") return null;
  const action = (
    enabled ? disablePushToDeployAction : enablePushToDeployAction
  ).bind(null, request.id);

  return (
    <form action={action}>
      <PendingSubmitButton
        idleLabel={enabled ? "Disable Auto-Deploy" : "Enable Auto-Deploy"}
        pendingLabel={enabled ? "Disabling..." : "Enabling..."}
        statusText={
          enabled
            ? "Disabling auto-deploy. Use Publish to Azure for future updates."
            : "Enabling auto-deploy. Future code updates will publish automatically."
        }
        variant="ghost"
        size="sm"
        title={
          enabled
            ? "Turn off automatic publishing. Future pushes will require Publish to Azure."
            : "Turn on automatic publishing for future pushes to the default branch."
        }
      />
    </form>
  );
}

function renderDeletePanel(request: {
  mcpIdentity?: boolean;
  id: string;
  repositoryOwner: string | null;
  repositoryName: string | null;
  repositoryStatus: string;
  publishStatus: string;
  azureWebAppName: string | null;
  azureDatabaseName: string | null;
}) {
  const deleteAction = deleteAppFormAction.bind(null, request.id);
  const canDeleteGitHub =
    request.repositoryStatus !== "DELETED" &&
    Boolean(request.repositoryOwner && request.repositoryName);
  const canDeleteAzure =
    request.publishStatus !== "DELETED" &&
    Boolean(request.azureWebAppName || request.azureDatabaseName);

  return (
    <details className="delete-panel">
      <summary>Delete App</summary>
      <div className="delete-panel__content">
        <ConfirmDeleteForm action={deleteAction} className="form-stack">
          <p className="delete-warning">
            Anything you leave unchecked must be deleted manually later.
          </p>
          <fieldset>
            <legend>Resources to delete</legend>
            <label>
              <input name="deletePortal" type="checkbox" />
              Remove this app from CU Launch
            </label>
            {canDeleteGitHub ? (
              <label>
                <input name="deleteGithub" type="checkbox" />
                Delete GitHub repository{" "}
                <code style={{ fontSize: "0.875em" }}>
                  {request.repositoryOwner}/{request.repositoryName}
                </code>{" "}
                <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                  (permanently removes your app&rsquo;s code from GitHub)
                </span>
              </label>
            ) : (
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  margin: 0,
                }}
              >
                GitHub repository already deleted or not tracked.
              </p>
            )}
            {canDeleteAzure ? (
              <label>
                <input name="deleteAzure" type="checkbox" />
                <span>
                  Delete Azure deployment
                  {request.mcpIdentity ? " and its owned MCP identity" : ""}
                  {request.azureWebAppName ? (
                    <>: Web App {request.azureWebAppName}</>
                  ) : null}
                  {request.azureDatabaseName ? (
                    <> and PostgreSQL database {request.azureDatabaseName}</>
                  ) : null}
                </span>
              </label>
            ) : (
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  margin: 0,
                }}
              >
                Azure deployment already deleted or not tracked.
              </p>
            )}
          </fieldset>
          <label>
            <input name="confirmDelete" type="checkbox" required />
            I understand that the checked items will be permanently deleted.
          </label>
          <div>
            <PendingSubmitButton
              idleLabel="Delete Selected Resources"
              pendingLabel="Deleting Selected Resources..."
              statusText="Deleting selected resources. This can take a moment."
              variant="danger"
              size="sm"
            />
          </div>
        </ConfirmDeleteForm>
      </div>
    </details>
  );
}

function renderSupportReference(supportReference: string) {
  return (
    <section className="card" aria-labelledby="app-support-heading">
      <h3 className="section-title" id="app-support-heading">Support reference</h3>
      <p>
        If you need help, share this support reference: {" "}
        <code>{supportReference}</code>
      </p>
    </section>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  return getAppPageMetadata(requestId, "details");
}

export default async function DownloadPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams?: Promise<{ section?: string | string[] }>;
}) {
  const { requestId } = await params;
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    notFound();
  }

  const requestedSection = (await searchParams)?.section;
  const isAdmin = await userHasAdminRole(userId);
  const appRequest = await prisma.appRequest.findFirst({
    where: appAccessWhere(requestId, userId, isAdmin),
    include: {
      template: { select: { slug: true } },
      mcpConfiguration: true,
      user: {
        select: {
          displayName: true,
          email: true,
        },
      },
      collaborators: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      collaborationInvites: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        include: {
          inviter: { select: { displayName: true, email: true } },
        },
      },
      publishAttempts: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      repositoryImport: true,
      securityReview: true,
      publishSetupChecks: {
        orderBy: { checkedAt: "desc" },
        take: 7,
      },
      environmentVariables: {
        orderBy: { key: "asc" },
      },
    },
  });

  if (!appRequest) {
    notFound();
  }

  if (
    appRequest.publishStatus !== "SUCCEEDED" &&
    appRequest.publishStatus !== "FAILED" &&
    !isAdmin
  ) {
    redirect(`/onboarding/${appRequest.id}`);
  }

  const publishFailed = appRequest.publishStatus === "FAILED";
  const section = getAppDetailsSection(requestedSection, publishFailed);
  const canDeleteAppRequest = isAdmin || appRequest.userId === userId;

  const displayPublishUrl = getDisplayPublishUrl(
    appRequest.primaryPublishUrl,
    appRequest.publishUrl,
  );
  const pub = publishBadge(appRequest.publishStatus);
  const effectivePublishingSetupStatus = getEffectivePublishingSetupStatus({
    publishStatus: appRequest.publishStatus,
    publishingSetupStatus: appRequest.publishingSetupStatus,
  });
  const showLoginNotices = section === "deployment";
  const nightly = appRequest.repositoryUrl && appRequest.repositoryStatus === "READY" && (section === "overview" || section === "security")
    ? await prisma.nightlyRepositoryScan.findUnique({ where: { repository: appRequest.repositoryUrl.toLowerCase() },
      select: { successfulSha: true, source: true } }) : null;
  const securityReview = section === "overview" || section === "security"
    ? ownerSecurityReview(appRequest.repositoryUrl, appRequest.securityReview, nightly)
    : null;
  const loginUpdateFramework = showLoginNotices ? getLoginUpdateFramework(appRequest) : null;
  const loginReview = showLoginNotices && needsImportedLoginReview(appRequest)
    ? await getImportedLoginReview({ userId, isAdmin }, appRequest.id)
    : null;

  const warning = (
    <>
      {appRequest.publishStatus === "SUCCEEDED" && appRequest.publishWarningSummary ? (
        <div className="warning-box" role="status">
          {appRequest.publishWarningSummary}
        </div>
      ) : null}
    </>
  );
  const loginNotices = (
    <>
      {appRequest.repositoryUrl && loginUpdateFramework ? (
        <LoginUpdateNotice
          appRequestId={appRequest.id}
          userId={userId}
          prompt={buildLoginUpdatePrompt({ repositoryUrl: appRequest.repositoryUrl, appName: appRequest.appName, framework: loginUpdateFramework })}
        />
      ) : null}
      {loginReview ? <LoginReviewPanel appId={appRequest.id} review={loginReview} prompt={buildImportedLoginReviewPrompt(appRequest)} /> : null}
    </>
  );

  let content: React.ReactNode;
  switch (section) {
    case "deployment":
      content = (
        <>
          {loginNotices}
          <section className="card app-details__publishing" aria-labelledby="app-publishing-heading">
            <h3 id="app-publishing-heading" className="section-title">Azure publishing</h3>

            {isAdmin && appRequest.publishErrorSummary &&
            appRequest.repositoryStatus !== "FAILED" ? (
              <div
                className="warning-box"
                style={{ marginBottom: "0.875rem" }}
              >
                Last publish note: {appRequest.publishErrorSummary}
              </div>
            ) : null}

            {renderPublishingSetupStatus({
              id: appRequest.id,
              repositoryStatus: appRequest.repositoryStatus,
              sourceOfTruth: appRequest.sourceOfTruth,
              preparationStatus: appRequest.repositoryImport?.preparationStatus,
              publishStatus: appRequest.publishStatus,
              publishingSetupStatus: effectivePublishingSetupStatus,
            })}

            {!loginReview || (!loginReview.publishingUpdateRequired && ["REVIEWED", "NOT_REQUIRED"].includes(loginReview.status)) ? renderPublishAction({
              requestId,
              publishStatus: appRequest.publishStatus,
              repositoryStatus: appRequest.repositoryStatus,
              sourceOfTruth: appRequest.sourceOfTruth,
              preparationStatus: appRequest.repositoryImport?.preparationStatus,
              publishingSetupStatus: effectivePublishingSetupStatus,
            }) : <p>Complete the sign-in review above before the first publish.</p>}
            {renderPushToDeployButton({
              id: appRequest.id,
              sourceOfTruth: appRequest.sourceOfTruth,
              repositoryStatus: appRequest.repositoryStatus,
              publishStatus: appRequest.publishStatus,
              deploymentTarget: appRequest.deploymentTarget,
              deploymentTriggerMode: appRequest.deploymentTriggerMode,
            })}
          </section>
          {appRequest.publishStatus === "SUCCEEDED"
            ? renderPublishedRecoveryActions({
                requestId,
                sourceOfTruth: appRequest.sourceOfTruth,
                repositoryStatus: appRequest.repositoryStatus,
                preparationStatus: appRequest.repositoryImport?.preparationStatus,
                publishingSetupStatus: effectivePublishingSetupStatus,
              })
            : null}
          <details className="card app-details__disclosure">
            <summary>Deployment details</summary>
            <div className="app-details__disclosure-content">
              <div className="status-table" style={{ marginBottom: "1rem" }}>
                {appRequest.azureWebAppName ? (
                  <div className="status-row">
                    Azure app: {appRequest.azureWebAppName}
                  </div>
                ) : null}
                {appRequest.sourceOfTruth === "PORTAL_MANAGED_REPO" ? (
                  <div className="status-row">
                    <span title={deploymentModeTooltip(appRequest.deploymentTriggerMode)}>
                      Deployment mode:{" "}
                      {formatDeploymentMode(appRequest.deploymentTriggerMode)}
                    </span>
                  </div>
                ) : null}
                {displayPublishUrl ? (
                  <div className="status-row">
                    <a
                      href={displayPublishUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="meta-link"
                    >
                      {displayPublishUrl}
                    </a>
                  </div>
                ) : null}
                {appRequest.publishAttempts[0]?.githubWorkflowRunUrl ? (
                  <div className="status-row">
                    <a
                      href={
                        appRequest.publishAttempts[0].githubWorkflowRunUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="meta-link"
                      title="View the automated process that deployed your app to Azure — useful for troubleshooting if a publish fails"
                    >
                      Deployment log
                    </a>
                  </div>
                ) : null}
              </div>

              {isAdmin && appRequest.publishingSetupErrorSummary ? (
                <div className="warning-box" style={{ marginBottom: "0.875rem" }}>
                  Publishing setup note: {appRequest.publishingSetupErrorSummary}
                </div>
              ) : null}
              {appRequest.publishSetupChecks?.length ? (
                <ul className="setup-status__checks">
                  {appRequest.publishSetupChecks.map((check) => (
                    <li key={check.checkKey}>
                      {formatCheckKey(check.checkKey)}: {formatStatus(check.status)}
                      {isAdmin ? <> — {check.message}</> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        </>
      );
      break;
    case "health":
      content = (
        <>
          {warning}
          {appRequest.azureWebAppName && ["FAILED", "SUCCEEDED"].includes(appRequest.publishStatus) ? (
            <AppHealthPanel app={appRequest} inDetailsSection />
          ) : (
            <div className="card">
              <h3 className="section-title">Health checks are unavailable</h3>
              <p>There is no tracked Azure deployment to check.</p>
            </div>
          )}
        </>
      );
      break;
    case "listing":
      content = (
        <>
          <PublicListingPanel
            appRequestId={appRequest.id}
            isPubliclyListed={appRequest.isPubliclyListed}
          />
        </>
      );
      break;
    case "collaborators":
      content = (
        <>
          {renderAppAccessSummary({
            owner: appRequest.user,
            collaborators: appRequest.collaborators,
            canManageCollaborators: appRequest.userId === userId || isAdmin,
            appRequestId: appRequest.id,
          })}
          {appRequest.userId === userId || isAdmin ? (
            <CollaborationInvitePanel
              appRequestId={appRequest.id}
              pendingInvites={appRequest.collaborationInvites}
            />
          ) : null}
        </>
      );
      break;
    case "repository": {
      const isImportedApp = appRequest.sourceOfTruth === "IMPORTED_REPOSITORY";
      const importedRepositoryRemoteWorkflow = getImportedRepositoryRemoteWorkflow({
        repositoryImport: appRequest.repositoryImport,
        repositoryUrl: appRequest.repositoryUrl,
        repositoryDefaultBranch: appRequest.repositoryDefaultBranch,
      });
      const isLocalCodexApp = isLocalCodexSource(appRequest.submittedConfig);
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { githubUsername: true, email: true },
      });
      const actorRepositoryAccess = await resolveRepositoryAccessForActor({
        requestId: appRequest.id,
        actorUserId: userId,
        githubUsername: currentUser?.githubUsername ?? null,
        legacyStatus: appRequest.repositoryAccessStatus,
        legacyNote: appRequest.repositoryAccessNote,
      });
      const codexHandoffPrompt =
        isLocalCodexApp && appRequest.repositoryUrl
          ? buildLocalCodexGitSetupPrompt({
              repositoryUrl: appRequest.repositoryUrl,
              appName: appRequest.appName,
              requestId,
              defaultBranch: appRequest.repositoryDefaultBranch,
              gitAuthor: currentUser ?? {},
              importFeatures: savedImportedFeatures(appRequest.submittedConfig),
            })
          : appRequest.repositoryUrl
            ? buildCodexHandoffPrompt(
                appRequest.repositoryUrl,
                appRequest.appName,
                requestId,
                {
                  gitAuthor: currentUser ?? {},
                  importFeatures: savedImportedFeatures(appRequest.submittedConfig),
                  defaultBranch:
                    importedRepositoryRemoteWorkflow?.defaultBranch ??
                    appRequest.repositoryDefaultBranch,
                  sourceRepositoryUrl:
                    importedRepositoryRemoteWorkflow?.sourceRepositoryUrl ??
                    (isImportedApp
                      ? appRequest.repositoryImport?.sourceRepositoryUrl ?? appRequest.repositoryUrl
                      : undefined),
                  localFolderMode: isImportedApp
                    ? undefined
                    : "new-or-existing",
                },
              )
            : null;

      content = (
        <>
          <div className="card">
            <h3 className="section-title">Your Code Repository</h3>
            {appRequest.repositoryStatus === "READY" && appRequest.repositoryUrl ? (
              <>
                <div className="status-table" style={{ marginBottom: "1rem" }}>
                  <div className="status-row">
                    <span>
                      Repository ready:{" "}
                      <a
                        href={appRequest.repositoryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="meta-link"
                      >
                        {appRequest.repositoryUrl}
                      </a>
                    </span>
                  </div>
                </div>
                {codexHandoffPrompt ? (
                  <CopyCodexHandoffButton prompt={codexHandoffPrompt} />
                ) : null}
              </>
            ) : appRequest.repositoryStatus === "FAILED" ? (
              <div className="error-box">
                Repository setup failed.
                A CU Launch administrator may need to fix the configuration before publishing can continue.
              </div>
            ) : (
              <div className="info-box">
                Setting up your code repository — check back shortly.
              </div>
            )}

            {isAdmin && appRequest.publishErrorSummary &&
            appRequest.repositoryStatus === "FAILED" ? (
              <div className="warning-box" style={{ marginTop: "0.75rem" }}>
                Repo setup note: {appRequest.publishErrorSummary}
              </div>
            ) : null}
          </div>
          <div className="card">
            <p className="section-title">Codex Workflow</p>
            <CodexPreparationChecklist
              appName={appRequest.appName}
              folderKind={
                isLocalCodexApp || isImportedApp
                  ? "existing"
                  : "new-or-existing"
              }
            />
          </div>

          {/* GitHub access section */}
          {appRequest.repositoryStatus === "READY" ? (
            <div className="card">
              <p className="section-title">Connect Codex to Your Repository</p>
              {actorRepositoryAccess.status === "GRANTED" ? (
                <div className="success-box">
                  Repository access has been granted for this app.
                </div>
              ) : null}
              <p
                style={{
                  fontSize: "0.9375rem",
                  marginBottom: "0.875rem",
                  marginTop:
                    actorRepositoryAccess.status === "GRANTED"
                      ? "0.875rem"
                      : undefined,
                }}
              >
                Want Codex to edit your app&rsquo;s code?{" "}
                <a
                  href="https://github.com/signup"
                  target="_blank"
                  rel="noreferrer"
                >
                  Create a free GitHub account
                </a>
                , then enter your username below. CU Launch will send you an invite to the repository.
              </p>
              {actorRepositoryAccess.note ? (
                <div
                  className="warning-box"
                  style={{ marginBottom: "0.875rem" }}
                >
                  {actorRepositoryAccess.note}
                </div>
              ) : null}
              <form
                action={saveGitHubUsernameAndGrantAccessAction.bind(
                  null,
                  requestId,
                )}
                style={{
                  display: "flex",
                  gap: "0.625rem",
                  flexWrap: "wrap",
                }}
              >
                <input
                  name="githubUsername"
                  type="text"
                  required
                  aria-label="GitHub username"
                  placeholder="GitHub username"
                  defaultValue={currentUser?.githubUsername ?? ""}
                  className="form-control"
                  style={{ maxWidth: "240px" }}
                />
                <button
                  type="submit"
                  className="btn btn--secondary-solid"
                >
                  {actorRepositoryAccess.status === "INVITED"
                    ? "Resend Repo Access Invite"
                    : actorRepositoryAccess.status === "GRANTED"
                      ? "Request Repository Access"
                      : "Send Repository Invite"}
                </button>
              </form>
            </div>
          ) : null}

          {isLocalCodexApp
            ? renderLocalCodexSetup({
                repositoryUrl: appRequest.repositoryUrl,
              })
            : null}

          {/* Imported repository status section */}
          {isImportedApp
            ? renderImportedRepositoryStatus({
                requestId,
                repositoryImport: appRequest.repositoryImport,
                showProviderDiagnostics: isAdmin,
              })
            : null}

          {importedRepositoryRemoteWorkflow ? (
            <div className="card">
              <p className="section-title">Use Codex to sync your imported app</p>
              <p>
                Keep the app connected to its original GitHub home and let Codex
                add the CU Launch-managed repository as a separate publishing
                destination. Open the local Codex project you already use for
                this app, then copy the complete prompt under Your Code Repository into a
                task inside that project.
              </p>
              <p>
                Codex will inspect both connections, protect your existing
                history and unfinished work, and run the technical Git commands.
                Do not run terminal commands yourself.
              </p>
            </div>
          ) : null}
        </>
      );
      break;
    }
    case "environment":
      content = (
        <>
          <EnvVarsPanel
            appRequestId={appRequest.id}
            envVars={appRequest.environmentVariables ?? []}
            isPublished={Boolean(appRequest.azureWebAppName)}
          />
        </>
      );
      break;
    case "support":
      content = (
        <>
          {renderSupportReference(appRequest.supportReference)}
          {canDeleteAppRequest
            ? renderDeletePanel({
                mcpIdentity: appRequest.template.slug === "mcp-server",
                id: appRequest.id,
                repositoryOwner: appRequest.repositoryOwner,
                repositoryName: appRequest.repositoryName,
                repositoryStatus: appRequest.repositoryStatus,
                publishStatus: appRequest.publishStatus,
                azureWebAppName: appRequest.azureWebAppName,
                azureDatabaseName: appRequest.azureDatabaseName,
              })
            : null}
        </>
      );
      break;
    case "security":
      content = appRequest.repositoryUrl && enrolledRepository(appRequest) ? (
        <LiveSecurityReview
          key={`${appRequest.id}:${appRequest.repositoryUrl}`}
          appId={appRequest.id}
          appName={appRequest.appName}
          repository={appRequest.repositoryUrl}
          savedReview={securityReview}
          automaticPublishing={appRequest.deploymentTriggerMode === "PUSH_TO_DEPLOY"}
          applyAction={canDeleteAppRequest ? applySecurityUpdate.bind(null, appRequest.id) : undefined}
        />
      ) : (
        <SecurityReviewPanel appName={appRequest.appName} repository={appRequest.repositoryUrl} review={securityReview} />
      );
      break;
    case "overview":
      content = (
        <>
          {warning}
          {securityReview && <section className="card security-review__notice" aria-labelledby="security-notice">
            <h3 id="security-notice">You have security details to review</h3>
            <p>Your app’s latest scan results are ready.</p>
            <Link href={appDetailsSectionHref("security")}>Review security details</Link>
          </section>}
          <AppReadinessChecklist
            repositoryReady={appRequest.repositoryStatus === "READY"}
            publishingReady={effectivePublishingSetupStatus === "READY"}
            publishStatus={appRequest.publishStatus}
            audience={getAppAudience(appRequest.submittedConfig)}
          />
          {appRequest.template.slug === "mcp-server" ? <McpConnectionCard connection={buildMcpConnectionSummary(appRequest.mcpConfiguration,{published:appRequest.publishStatus === "SUCCEEDED"})} /> : null}
          <div className="app-details__overview-links">
            <Link className="btn btn--ghost" href={appDetailsSectionHref("deployment")}>
              {publishFailed ? "Review publishing" : "View deployment"}
            </Link>
          </div>
        </>
      );
      break;
  }

  return (
    <main className="app-details">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <Link href="/apps">My Apps</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page">App details</span>
      </nav>

      <header className="page-header app-details__header">
        <div className="app-details__identity">
          <h1>{appRequest.appName}</h1>
          <span className={`badge badge--${pub.variant}`}>{pub.label}</span>
        </div>
        {appRequest.publishStatus === "SUCCEEDED" && displayPublishUrl ? (
          <a
            className="btn btn--primary-solid app-details__open"
            href={displayPublishUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open your app
          </a>
        ) : null}
      </header>

      <AppDetailsSectionLayout section={section} publishFailed={publishFailed}>
        {content}
      </AppDetailsSectionLayout>
    </main>
  );
}
