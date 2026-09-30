import type { Prisma } from "@prisma/client";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import type { GitHubRepoVisibility } from "@/features/repositories/config";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { IMPORTED_NEXT_RUNTIME } from "./compatibility";
import { createImportAttempt } from "./attempts";
import {
  createRepositoryImportQueue,
  type RepositoryImportQueue,
} from "./queue";

const ENQUEUE_FAILURE_SUMMARY =
  "Repository import could not be queued. Please retry.";

export type RepositoryMetadata = {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
};

export type QueueExternalRepositoryImportInput = {
  userId: string;
  appName: string;
  description: string;
  source: RepositoryMetadata;
  targetOwner: string;
  targetName: string;
  targetVisibility: GitHubRepoVisibility;
  supportReference: string;
};

type QueueImportDb = Pick<typeof prisma, "$transaction">;

export async function queueExternalRepositoryImport(
  input: QueueExternalRepositoryImportInput,
  deps: {
    db?: QueueImportDb;
    queue?: RepositoryImportQueue;
    now?: () => Date;
  } = {},
): Promise<{ requestId: string; attemptId: string; queued: boolean }> {
  const db = deps.db ?? prisma;
  const queue = deps.queue ?? createRepositoryImportQueue();
  const now = deps.now ?? (() => new Date());
  const queuedAt = now();

  const created = await db.$transaction(async (tx) => {
    const template = await upsertImportedTemplate(tx);
    const appRequest = await tx.appRequest.create({
      data: {
        userId: input.userId,
        templateId: template.id,
        templateVersion: "1.0.0",
        appName: input.appName,
        submittedConfig: {
          repositoryUrl: input.source.url,
          description: input.description,
          hostingTarget: "Azure App Service",
          templateSlug: "imported-web-app",
          importRuntime: IMPORTED_NEXT_RUNTIME,
          databaseProvider: "postgresql",
          entraLogin: true,
        },
        generationStatus: "SUCCEEDED",
        supportReference: input.supportReference,
        deploymentTarget: "Azure App Service",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryProvider: "GITHUB",
        repositoryOwner: input.targetOwner,
        repositoryName: input.targetName,
        repositoryUrl: null,
        repositoryDefaultBranch: null,
        repositoryVisibility: input.targetVisibility,
        repositoryStatus: "PENDING",
        publishStatus: "NOT_STARTED",
        publishErrorSummary: null,
      },
    });
    const repositoryImport = await tx.repositoryImport.create({
      data: {
        appRequestId: appRequest.id,
        sourceRepositoryUrl: input.source.url,
        sourceRepositoryOwner: input.source.owner,
        sourceRepositoryName: input.source.name,
        sourceRepositoryDefaultBranch: input.source.defaultBranch,
        targetRepositoryOwner: input.targetOwner,
        targetRepositoryName: input.targetName,
        targetRepositoryUrl: null,
        targetRepositoryDefaultBranch: null,
        importStatus: "PENDING",
        importErrorSummary: null,
        compatibilityStatus: "NOT_SCANNED",
        compatibilityFindings: [],
        preparationStatus: "NOT_STARTED",
      },
      select: { id: true },
    });
    const attempt = await createImportAttempt(tx, {
      repositoryImportId: repositoryImport.id,
      now: queuedAt,
    });

    return {
      requestId: appRequest.id,
      repositoryImportId: repositoryImport.id,
      attemptId: attempt.attemptId,
    };
  });

  await recordAuditEvent("EXISTING_APP_ADD_REQUESTED", {
    requestId: created.requestId,
    supportReference: input.supportReference,
    sourceRepositoryUrl: input.source.url,
    targetRepositoryUrl: null,
  });

  try {
    await queue.send({ attemptId: created.attemptId });
    return {
      requestId: created.requestId,
      attemptId: created.attemptId,
      queued: true,
    };
  } catch {
    const failedAt = now();
    const failed = await db.$transaction(async (tx) => {
      const attempt = await tx.repositoryImportAttempt.updateMany({
        where: {
          id: created.attemptId,
          status: "PENDING",
          repositoryImport: { activeAttemptId: created.attemptId },
        },
        data: {
          status: "FAILED",
          stage: "ENQUEUE",
          errorSummary: ENQUEUE_FAILURE_SUMMARY,
          finishedAt: failedAt,
        },
      });

      if (attempt.count !== 1) {
        return false;
      }

      await tx.repositoryImport.updateMany({
        where: {
          id: created.repositoryImportId,
          activeAttemptId: created.attemptId,
        },
        data: {
          activeAttemptId: null,
          importStatus: "FAILED",
          importErrorSummary: ENQUEUE_FAILURE_SUMMARY,
          preparationStatus: "BLOCKED",
          preparationErrorSummary: ENQUEUE_FAILURE_SUMMARY,
        },
      });
      await tx.appRequest.updateMany({
        where: {
          id: created.requestId,
          repositoryStatus: "PENDING",
        },
        data: {
          repositoryStatus: "FAILED",
          publishErrorSummary: ENQUEUE_FAILURE_SUMMARY,
        },
      });
      return true;
    });

    if (failed) {
      await recordAuditEvent("EXISTING_APP_IMPORT_FAILED", {
        requestId: created.requestId,
        sourceRepository: `${input.source.owner}/${input.source.name}`,
        targetRepository: `${input.targetOwner}/${input.targetName}`,
        error: ENQUEUE_FAILURE_SUMMARY,
      });
      await safeNotifyAppEvent({
        appRequestId: created.requestId,
        eventKey: "REPOSITORY_FAILED",
        actorUserId: input.userId,
        directRecipientUserIds: [input.userId],
      });
    }

    return {
      requestId: created.requestId,
      attemptId: created.attemptId,
      queued: !failed,
    };
  }
}

async function upsertImportedTemplate(tx: Prisma.TransactionClient) {
  return tx.template.upsert({
    where: { slug: "imported-web-app" },
    update: {
      slug: "imported-web-app",
      name: "Imported Web App",
      description:
        "Existing GitHub app prepared for Azure App Service publishing.",
      version: "1.0.0",
      status: "ACTIVE",
      inputSchema: {},
      hostingOptions: ["Azure App Service"],
    },
    create: {
      slug: "imported-web-app",
      name: "Imported Web App",
      description:
        "Existing GitHub app prepared for Azure App Service publishing.",
      version: "1.0.0",
      status: "ACTIVE",
      inputSchema: {},
      hostingOptions: ["Azure App Service"],
    },
  });
}
