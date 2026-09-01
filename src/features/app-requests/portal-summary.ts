import type {
  GenerationStatus,
  PublishAttemptStage,
  PublishAttemptStatus,
  PublishStatus,
  PublishingSetupStatus,
  RepositoryAccessStatus,
  RepositoryPreparationStatus,
  RepositoryStatus,
  SourceOfTruth,
} from "@prisma/client";
import {
  getPublishEligibility,
  getPublishingSetupRepairEligibility,
} from "@/features/publishing/eligibility";
import { getEffectivePublishingSetupStatus } from "@/features/publishing/setup/status";
import type { ActorRepositoryAccess } from "@/features/repositories/actor-access";

export type PortalNextAction =
  | "request_github_access"
  | "publish_app_to_azure"
  | "get_publish_status"
  | "repair_publishing_setup"
  | "retry_publish"
  | "open_portal_for_advanced_management";

export type PortalPublishAttemptSummary = {
  id: string;
  appId: string;
  status: PublishAttemptStatus;
  stage: PublishAttemptStage;
  workflowUrl: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type PortalAppSummary = {
  id: string;
  appName: string;
  template: { slug: string; name: string };
  sourceOfTruth: SourceOfTruth;
  generationStatus: GenerationStatus;
  repositoryStatus: RepositoryStatus;
  publishingSetupStatus: PublishingSetupStatus;
  publishStatus: PublishStatus;
  repositoryAccess: {
    status: RepositoryAccessStatus;
    note: string | null;
  };
  repository: { url: string | null; defaultBranch: string | null };
  supportReference: string;
  latestAttempt: PortalPublishAttemptSummary | null;
  liveUrl: string | null;
  allowedNextActions: PortalNextAction[];
};

type PortalAppReadRecord = {
  id: string;
  appName: string;
  sourceOfTruth: SourceOfTruth;
  generationStatus: GenerationStatus;
  repositoryStatus: RepositoryStatus;
  repositoryAccessStatus: RepositoryAccessStatus;
  repositoryAccessNote: string | null;
  repositoryUrl: string | null;
  repositoryDefaultBranch: string | null;
  publishStatus: PublishStatus;
  publishingSetupStatus: PublishingSetupStatus;
  publishUrl: string | null;
  primaryPublishUrl: string | null;
  supportReference: string;
  template: { slug: string; name: string };
  repositoryImport: { preparationStatus: RepositoryPreparationStatus } | null;
  publishAttempts: PortalPublishAttemptSummaryInput[];
};

type PortalPublishAttemptSummaryInput = Omit<PortalPublishAttemptSummary, "appId" | "workflowUrl"> & {
  githubWorkflowRunUrl: string | null;
};

export function summarizePortalPublishAttempt(
  attempt: PortalPublishAttemptSummaryInput,
  appId: string,
): PortalPublishAttemptSummary {
  return {
    id: attempt.id,
    appId,
    status: attempt.status,
    stage: attempt.stage,
    workflowUrl: attempt.githubWorkflowRunUrl,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
  };
}

function allowedNextActions(
  app: PortalAppReadRecord,
  repositoryAccess: ActorRepositoryAccess,
): PortalNextAction[] {
  if (app.sourceOfTruth !== "PORTAL_MANAGED_REPO") {
    return ["open_portal_for_advanced_management"];
  }

  const actions: PortalNextAction[] = [];
  const eligibilityInput = {
    sourceOfTruth: app.sourceOfTruth,
    repositoryStatus: app.repositoryStatus,
    preparationStatus: app.repositoryImport?.preparationStatus,
    publishingSetupStatus: app.publishingSetupStatus,
    publishStatus: app.publishStatus,
  } as const;

  if (
    app.repositoryStatus === "READY" &&
    repositoryAccess.status !== "GRANTED"
  ) {
    actions.push("request_github_access");
  }

  if (getPublishEligibility(eligibilityInput, {
    allowedPublishStatuses: ["NOT_STARTED", "SUCCEEDED"],
  }).eligible) {
    actions.push("publish_app_to_azure");
  }

  if (getPublishingSetupRepairEligibility(eligibilityInput).eligible) {
    actions.push("repair_publishing_setup");
  }

  if (getPublishEligibility(eligibilityInput, {
    allowedPublishStatuses: ["FAILED"],
    allowFailedSetupRetry: true,
  }).eligible) {
    actions.push("retry_publish");
  }

  if (app.publishStatus !== "NOT_STARTED") {
    actions.push("get_publish_status");
  }

  actions.push("open_portal_for_advanced_management");
  return actions;
}

export function summarizePortalApp(
  app: PortalAppReadRecord,
  repositoryAccess: ActorRepositoryAccess,
): PortalAppSummary {
  const latestAttempt = app.publishAttempts[0]
    ? summarizePortalPublishAttempt(app.publishAttempts[0], app.id)
    : null;

  return {
    id: app.id,
    appName: app.appName,
    template: app.template,
    sourceOfTruth: app.sourceOfTruth,
    generationStatus: app.generationStatus,
    repositoryStatus: app.repositoryStatus,
    publishingSetupStatus: getEffectivePublishingSetupStatus({
      publishStatus: app.publishStatus,
      publishingSetupStatus: app.publishingSetupStatus,
    }),
    publishStatus: app.publishStatus,
    repositoryAccess,
    repository: {
      url: app.repositoryUrl,
      defaultBranch: app.repositoryDefaultBranch,
    },
    supportReference: app.supportReference,
    latestAttempt,
    liveUrl: app.publishUrl ?? app.primaryPublishUrl,
    allowedNextActions: allowedNextActions(app, repositoryAccess),
  };
}
