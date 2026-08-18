"use server";

import { redirect } from "next/navigation";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { createAppSchema } from "@/features/create-app/validation";
import { buildSourceSnapshot } from "@/features/generation/build-source-snapshot";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { grantManagedRepositoryAccess } from "@/features/repositories/access";
import { bootstrapManagedRepository } from "@/features/repositories/bootstrap-managed-repository";
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
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubUsername: true },
  });
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
      const repository = await bootstrapManagedRepository({
        appRequestId: request.id,
        input,
        files,
      });

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

      if (currentUser?.githubUsername) {
        await recordAuditEvent("REPOSITORY_ACCESS_REQUESTED", {
          requestId: request.id,
          supportReference,
          githubUsername: currentUser.githubUsername,
        });

        try {
          const accessResult = await grantManagedRepositoryAccess({
            owner: repository.owner,
            repositoryName: repository.name,
            githubUsername: currentUser.githubUsername,
          });

          await prisma.appRequest.update({
            where: { id: request.id },
            data: {
              repositoryAccessStatus: accessResult.status,
              repositoryAccessNote:
                accessResult.status === "INVITED"
                  ? `GitHub invited @${currentUser.githubUsername} to this repository.`
                  : `GitHub access is ready for @${currentUser.githubUsername}.`,
            },
          });

          await recordAuditEvent("REPOSITORY_ACCESS_SUCCEEDED", {
            requestId: request.id,
            supportReference,
            githubUsername: currentUser.githubUsername,
            accessStatus: accessResult.status,
          });
        } catch (error) {
          console.error("Managed repository access grant failed", {
            requestId: request.id,
            supportReference,
            githubUsername: currentUser.githubUsername,
            error,
          });

          await prisma.appRequest.update({
            where: { id: request.id },
            data: {
              repositoryAccessStatus: "FAILED",
              repositoryAccessNote:
                error instanceof Error ? error.message : "unknown",
            },
          });

          await recordAuditEvent("REPOSITORY_ACCESS_FAILED", {
            requestId: request.id,
            supportReference,
            githubUsername: currentUser.githubUsername,
            error: error instanceof Error ? error.message : "unknown",
          });
        }
      }
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
          publishErrorSummary:
            error instanceof Error ? error.message : "unknown",
        },
      });

      await recordAuditEvent("REPOSITORY_BOOTSTRAP_FAILED", {
        requestId: request.id,
        supportReference,
        error: error instanceof Error ? error.message : "unknown",
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
    await prisma.appRequest.update({
      where: { id: request.id },
      data: { generationStatus: "FAILED" },
    });

    await recordAuditEvent("APP_REQUEST_FAILED", {
      requestId: request.id,
      supportReference,
      error: error instanceof Error ? error.message : "unknown",
    });

    throw error;
  }

  redirect(`/onboarding/${request.id}`);
}
