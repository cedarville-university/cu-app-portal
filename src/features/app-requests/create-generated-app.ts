import type { CreateAppRequestInput } from "./types";
import { buildSourceSnapshot } from "@/features/generation/build-source-snapshot";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { bootstrapManagedRepository } from "@/features/repositories/bootstrap-managed-repository";
import { getE2EManagedRepositoryBootstrap } from "@/features/repositories/e2e-bootstrap";
import {
  REPOSITORY_SETUP_FAILURE_SUMMARY,
  SOURCE_GENERATION_FAILURE_SUMMARY,
} from "@/features/repositories/failure-feedback";
import {
  getActiveTemplateBySlug,
  serializeTemplateForStorage,
} from "@/features/templates/catalog";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { createSupportReference } from "@/lib/support-reference";

export type CreateGeneratedAppResult = {
  requestId: string;
  supportReference: string;
  generationStatus: "SUCCEEDED" | "FAILED";
  repositoryStatus: "READY" | "FAILED";
  repositoryUrl: string | null;
};

export type CreateGeneratedAppDependencies = {
  getActiveTemplateBySlug: typeof getActiveTemplateBySlug;
  serializeTemplateForStorage: typeof serializeTemplateForStorage;
  prisma: Pick<typeof prisma, "template" | "appRequest">;
  createSupportReference: typeof createSupportReference;
  buildSourceSnapshot: typeof buildSourceSnapshot;
  getE2EManagedRepositoryBootstrap: typeof getE2EManagedRepositoryBootstrap;
  bootstrapManagedRepository: typeof bootstrapManagedRepository;
  recordAuditEvent: typeof recordAuditEvent;
  safeNotifyAppEvent: typeof safeNotifyAppEvent;
};

const defaultDependencies: CreateGeneratedAppDependencies = {
  getActiveTemplateBySlug,
  serializeTemplateForStorage,
  prisma,
  createSupportReference,
  buildSourceSnapshot,
  getE2EManagedRepositoryBootstrap,
  bootstrapManagedRepository,
  recordAuditEvent,
  safeNotifyAppEvent,
};

export async function createGeneratedApp(
  request: {
    actorUserId: string;
    input: CreateAppRequestInput;
    source: "portal-ui" | "codex-mcp";
    portalOperation?: string;
    idempotencyKey?: string;
  },
  dependencies: CreateGeneratedAppDependencies = defaultDependencies,
): Promise<CreateGeneratedAppResult> {
  const template = dependencies.getActiveTemplateBySlug(
    request.input.templateSlug,
  );

  if (!template) {
    throw new Error("Template not found.");
  }

  const persistedTemplate = await dependencies.prisma.template.upsert({
    where: { slug: template.slug },
    update: dependencies.serializeTemplateForStorage(template),
    create: dependencies.serializeTemplateForStorage(template),
  });
  const supportReference = dependencies.createSupportReference();
  const appRequest = await dependencies.prisma.appRequest.create({
    data: {
      userId: request.actorUserId,
      templateId: persistedTemplate.id,
      templateVersion: template.version,
      appName: request.input.appName,
      submittedConfig: request.input,
      generationStatus: "PENDING",
      supportReference,
      deploymentTarget: request.input.hostingTarget,
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "PENDING",
      publishStatus: "NOT_STARTED",
    },
  });
  const auditContext = {
    actorUserId: request.actorUserId,
    source: request.source,
    requestId: appRequest.id,
    supportReference,
    ...(request.portalOperation && request.idempotencyKey
      ? {
          operation: request.portalOperation,
          idempotencyKey: request.idempotencyKey,
        }
      : {}),
  };

  try {
    const files = await dependencies.buildSourceSnapshot(request.input);
    let repositoryStatus: "READY" | "FAILED" = "FAILED";
    let repositoryUrl: string | null = null;

    await dependencies.recordAuditEvent("REPOSITORY_BOOTSTRAP_REQUESTED", {
      ...auditContext,
    });

    try {
      const repository =
        dependencies.getE2EManagedRepositoryBootstrap({
          appRequestId: appRequest.id,
          input: request.input,
        }) ??
        (await dependencies.bootstrapManagedRepository({
          appRequestId: appRequest.id,
          input: request.input,
          files,
        }));

      await dependencies.prisma.appRequest.update({
        where: { id: appRequest.id },
        data: {
          repositoryProvider: repository.provider,
          repositoryOwner: repository.owner,
          repositoryName: repository.name,
          repositoryUrl: repository.url,
          repositoryDefaultBranch: repository.defaultBranch,
          repositoryVisibility: repository.visibility,
          repositoryStatus: "READY",
          repositoryAccessStatus: "NOT_REQUESTED",
          repositoryAccessNote: null,
        },
      });
      await dependencies.recordAuditEvent("REPOSITORY_BOOTSTRAP_SUCCEEDED", {
        ...auditContext,
        repositoryUrl: repository.url,
      });
      await dependencies.safeNotifyAppEvent({
        appRequestId: appRequest.id,
        eventKey: "REPOSITORY_READY",
        actorUserId: request.actorUserId,
        directRecipientUserIds: [request.actorUserId],
      });
      repositoryStatus = "READY";
      repositoryUrl = repository.url;
    } catch {
      console.error("Managed repository bootstrap failed", {
        requestId: appRequest.id,
        supportReference,
        source: request.source,
        failureStage: "repository-bootstrap",
      });
      await dependencies.prisma.appRequest.update({
        where: { id: appRequest.id },
        data: {
          repositoryStatus: "FAILED",
          publishErrorSummary: REPOSITORY_SETUP_FAILURE_SUMMARY,
        },
      });
      await dependencies.recordAuditEvent("REPOSITORY_BOOTSTRAP_FAILED", {
        ...auditContext,
        failureStage: "repository-bootstrap",
        safeSummary: REPOSITORY_SETUP_FAILURE_SUMMARY,
      });
      await dependencies.safeNotifyAppEvent({
        appRequestId: appRequest.id,
        eventKey: "REPOSITORY_FAILED",
        actorUserId: request.actorUserId,
        directRecipientUserIds: [request.actorUserId],
      });
    }

    await dependencies.prisma.appRequest.update({
      where: { id: appRequest.id },
      data: { generationStatus: "SUCCEEDED" },
    });
    await dependencies.recordAuditEvent("APP_REQUEST_SUCCEEDED", auditContext);
    await dependencies.safeNotifyAppEvent({
      appRequestId: appRequest.id,
      eventKey: "APP_CREATED",
      actorUserId: request.actorUserId,
      directRecipientUserIds: [request.actorUserId],
    });

    return {
      requestId: appRequest.id,
      supportReference,
      generationStatus: "SUCCEEDED",
      repositoryStatus,
      repositoryUrl,
    };
  } catch {
    console.error("Generated app source build failed", {
      requestId: appRequest.id,
      supportReference,
      source: request.source,
      failureStage: "source-generation",
    });
    await dependencies.prisma.appRequest.update({
      where: { id: appRequest.id },
      data: {
        generationStatus: "FAILED",
        repositoryStatus: "FAILED",
        publishErrorSummary: SOURCE_GENERATION_FAILURE_SUMMARY,
      },
    });
    await dependencies.recordAuditEvent("APP_REQUEST_FAILED", {
      ...auditContext,
      failureStage: "source-generation",
      safeSummary: SOURCE_GENERATION_FAILURE_SUMMARY,
    });
    await dependencies.safeNotifyAppEvent({
      appRequestId: appRequest.id,
      eventKey: "REPOSITORY_FAILED",
      actorUserId: request.actorUserId,
      directRecipientUserIds: [request.actorUserId],
    });

    return {
      requestId: appRequest.id,
      supportReference,
      generationStatus: "FAILED",
      repositoryStatus: "FAILED",
      repositoryUrl: null,
    };
  }
}
