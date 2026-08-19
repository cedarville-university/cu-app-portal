"use server";

import { redirect } from "next/navigation";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { createAppSchema } from "@/features/create-app/validation";
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

export async function extractCreateAppInput(
  formData: FormData,
): Promise<CreateAppRequestInput> {
  const templateSlug = String(formData.get("templateSlug") ?? "").trim();
  const template = getActiveTemplateBySlug(templateSlug);

  if (!template) {
    throw new Error("Invalid template selection.");
  }

  const payload = {
    templateSlug: template.slug,
    appName: String(formData.get("appName") ?? ""),
    description: String(formData.get("description") ?? ""),
    hostingTarget: String(
      formData.get("hostingTarget") ?? template.hostingTarget,
    ),
    databaseProvider: String(
      formData.get("databaseProvider") ??
        template.features.database.defaultProvider,
    ),
    entraLogin: String(
      formData.get("entraLogin") ?? template.features.entraLogin.defaultEnabled,
    ),
  };

  const parsed = createAppSchema({
    hostingTarget: template.hostingTarget,
    features: template.features,
  }).parse(payload);

  return { ...parsed, templateSlug: payload.templateSlug };
}

export async function createAppAction(formData: FormData) {
  const input = await extractCreateAppInput(formData);
  const template = getActiveTemplateBySlug(input.templateSlug);

  if (!template) {
    throw new Error("Template not found.");
  }

  const persistedTemplate = await prisma.template.upsert({
    where: { slug: template.slug },
    update: serializeTemplateForStorage(template),
    create: serializeTemplateForStorage(template),
  });
  const userId = await resolveCurrentUserId();
  const supportReference = createSupportReference();
  const request = await prisma.appRequest.create({
    data: {
      userId,
      templateId: persistedTemplate.id,
      templateVersion: template.version,
      appName: input.appName,
      submittedConfig: input,
      generationStatus: "PENDING",
      supportReference,
      deploymentTarget: input.hostingTarget,
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "PENDING",
      publishStatus: "NOT_STARTED",
    },
  });
  try {
    const files = await buildSourceSnapshot(input);

    await recordAuditEvent("REPOSITORY_BOOTSTRAP_REQUESTED", {
      requestId: request.id,
      supportReference,
    });

    try {
      const repository =
        getE2EManagedRepositoryBootstrap({
          appRequestId: request.id,
          input,
        }) ??
        (await bootstrapManagedRepository({
          appRequestId: request.id,
          input,
          files,
        }));

      await prisma.appRequest.update({
        where: { id: request.id },
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
      await recordAuditEvent("REPOSITORY_BOOTSTRAP_SUCCEEDED", {
        requestId: request.id,
        supportReference,
        repositoryUrl: repository.url,
      });
      await safeNotifyAppEvent({
        appRequestId: request.id,
        eventKey: "REPOSITORY_READY",
        actorUserId: userId,
        directRecipientUserIds: [userId],
      });
    } catch (error) {
      console.error("Managed repository bootstrap failed", {
        requestId: request.id,
        supportReference,
        error,
      });

      await prisma.appRequest.update({
        where: { id: request.id },
        data: {
          repositoryStatus: "FAILED",
          publishErrorSummary: REPOSITORY_SETUP_FAILURE_SUMMARY,
        },
      });

      await recordAuditEvent("REPOSITORY_BOOTSTRAP_FAILED", {
        requestId: request.id,
        supportReference,
        failureStage: "repository-bootstrap",
        safeSummary: REPOSITORY_SETUP_FAILURE_SUMMARY,
      });
      await safeNotifyAppEvent({
        appRequestId: request.id,
        eventKey: "REPOSITORY_FAILED",
        actorUserId: userId,
        directRecipientUserIds: [userId],
      });
    }

    await prisma.appRequest.update({
      where: { id: request.id },
      data: { generationStatus: "SUCCEEDED" },
    });

    await recordAuditEvent("APP_REQUEST_SUCCEEDED", {
      requestId: request.id,
      supportReference,
    });
    await safeNotifyAppEvent({
      appRequestId: request.id,
      eventKey: "APP_CREATED",
      actorUserId: userId,
      directRecipientUserIds: [userId],
    });
  } catch (error) {
    console.error("Generated app source build failed", {
      requestId: request.id,
      supportReference,
      error,
    });
    await prisma.appRequest.update({
      where: { id: request.id },
      data: {
        generationStatus: "FAILED",
        repositoryStatus: "FAILED",
        publishErrorSummary: SOURCE_GENERATION_FAILURE_SUMMARY,
      },
    });

    await recordAuditEvent("APP_REQUEST_FAILED", {
      requestId: request.id,
      supportReference,
      failureStage: "source-generation",
      safeSummary: SOURCE_GENERATION_FAILURE_SUMMARY,
    });
    await safeNotifyAppEvent({
      appRequestId: request.id,
      eventKey: "REPOSITORY_FAILED",
      actorUserId: userId,
      directRecipientUserIds: [userId],
    });
  }

  redirect(`/onboarding/${request.id}`);
}
