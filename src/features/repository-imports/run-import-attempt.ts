import type { RepositoryImportAttemptStage } from "@prisma/client";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { claimImportAttempt, type ImportAttemptLease } from "./attempts";
import {
  importRepositoryWithHistory,
  RepositoryImportError,
  type RepositoryMetadata,
} from "./import-repository";

export type RepositoryImportRunResult =
  | { disposition: "complete"; result: "succeeded" | "already-terminal" }
  | { disposition: "abandon"; errorSummary: string }
  | { disposition: "dead-letter"; errorSummary: string };

type AttemptContext = {
  id: string;
  repositoryImport: {
    id: string;
    sourceRepositoryOwner: string;
    sourceRepositoryName: string;
    sourceRepositoryUrl: string;
    sourceRepositoryDefaultBranch: string | null;
    targetRepositoryOwner: string;
    targetRepositoryName: string;
    appRequest: {
      id: string;
      userId: string;
      supportReference: string;
    };
  };
};

export type RepositoryImportRunnerDeps = {
  db: typeof prisma;
  claimImportAttempt: typeof claimImportAttempt;
  importRepository: typeof importRepositoryWithHistory;
  createGitHubClients: (context: AttemptContext) => {
    targetGithub: Parameters<typeof importRepositoryWithHistory>[0]["github"];
    sourceGithub?: Parameters<typeof importRepositoryWithHistory>[0]["sourceGithub"];
  };
  recordAuditEvent: typeof recordAuditEvent;
  notifyAppEvent: typeof safeNotifyAppEvent;
  now: () => Date;
  log: (event: string, details: Record<string, unknown>) => void;
  applicationCommit: string;
  imageDigest: string;
};

type RunInput = {
  attemptId: string;
  workerExecutionName: string;
  deliveryCount: number;
};

class LeaseLostError extends Error {
  constructor() {
    super("Repository import lease is no longer owned by this worker.");
    this.name = "LeaseLostError";
  }
}

function createDefaultGitHubClients(context: AttemptContext) {
  const config = loadGitHubAppConfig();
  const targetInstallationId = findInstallationId(
    config.installationIdsByOrg,
    context.repositoryImport.targetRepositoryOwner,
  );
  if (!targetInstallationId) {
    throw Object.assign(new Error("Target GitHub App installation is missing."), {
      status: 403,
    });
  }

  const sourceInstallationId = findInstallationId(
    config.installationIdsByOrg,
    context.repositoryImport.sourceRepositoryOwner,
  );
  const clientInput = {
    appId: config.appId,
    privateKey: config.privateKey,
  };

  return {
    targetGithub: createGitHubAppClient({
      ...clientInput,
      installationId: targetInstallationId,
    }),
    sourceGithub: sourceInstallationId
      ? createGitHubAppClient({
          ...clientInput,
          installationId: sourceInstallationId,
        })
      : undefined,
  };
}

function findInstallationId(
  installationIdsByOrg: Record<string, string>,
  owner: string,
) {
  return Object.entries(installationIdsByOrg).find(
    ([org]) => org.toLowerCase() === owner.toLowerCase(),
  )?.[1];
}

function defaultLog(event: string, details: Record<string, unknown>) {
  console.info("[repository-import-worker]", event, details);
}

function defaultDependencies(): RepositoryImportRunnerDeps {
  return {
    db: prisma,
    claimImportAttempt,
    importRepository: importRepositoryWithHistory,
    createGitHubClients: createDefaultGitHubClients,
    recordAuditEvent,
    notifyAppEvent: safeNotifyAppEvent,
    now: () => new Date(),
    log: defaultLog,
    applicationCommit: process.env.APP_COMMIT_SHA ?? "unknown",
    imageDigest: process.env.CONTAINER_IMAGE_DIGEST ?? "unknown",
  };
}

export async function runRepositoryImportAttempt(
  input: RunInput,
  dependencies: Partial<RepositoryImportRunnerDeps> = {},
): Promise<RepositoryImportRunResult> {
  const deps = { ...defaultDependencies(), ...dependencies };
  const claimedAt = deps.now();
  const lease = await deps.claimImportAttempt({
    attemptId: input.attemptId,
    workerExecutionName: input.workerExecutionName,
    deliveryCount: input.deliveryCount,
    now: claimedAt,
  });

  if (!lease) {
    return { disposition: "complete", result: "already-terminal" };
  }

  const context = (await deps.db.repositoryImportAttempt.findUnique({
    where: { id: input.attemptId },
    include: {
      repositoryImport: {
        include: { appRequest: true },
      },
    },
  })) as AttemptContext | null;

  if (!context) {
    return {
      disposition: "dead-letter",
      errorSummary: "Repository import attempt was not found.",
    };
  }

  const logDetails = {
    supportReference: context.repositoryImport.appRequest.supportReference,
    requestId: context.repositoryImport.appRequest.id,
    repositoryImportId: context.repositoryImport.id,
    attemptId: input.attemptId,
    workerExecutionName: input.workerExecutionName,
    applicationCommit: deps.applicationCommit,
    imageDigest: deps.imageDigest,
  };
  deps.log("started", { ...logDetails, stage: "CLAIM" });

  await deps.db.repositoryImport.updateMany({
    where: {
      id: context.repositoryImport.id,
      activeAttemptId: input.attemptId,
    },
    data: { importStatus: "RUNNING", importErrorSummary: null },
  });

  let currentStage: RepositoryImportAttemptStage = "CREATE_TARGET";
  try {
    const clients = deps.createGitHubClients(context);
    const source: RepositoryMetadata = {
      owner: context.repositoryImport.sourceRepositoryOwner,
      name: context.repositoryImport.sourceRepositoryName,
      url: context.repositoryImport.sourceRepositoryUrl,
      defaultBranch:
        context.repositoryImport.sourceRepositoryDefaultBranch ?? "main",
    };
    const repository = await deps.importRepository({
      appRequestId: context.repositoryImport.appRequest.id,
      source,
      target: {
        owner: context.repositoryImport.targetRepositoryOwner,
        name: context.repositoryImport.targetRepositoryName,
        visibility: "private",
      },
      github: clients.targetGithub,
      sourceGithub: clients.sourceGithub,
      onTargetReady: async (targetRepository) => {
        currentStage = "CREATE_TARGET";
        await persistTargetBeforeClone({
          deps,
          lease,
          targetRepository,
          now: deps.now(),
        });
      },
    });

    currentStage = "COMPLETE";
    const completedAt = deps.now();
    const completed = await completeSuccess({
      deps,
      lease,
      repository,
      now: completedAt,
    });
    if (!completed) {
      return { disposition: "complete", result: "already-terminal" };
    }

    await deps.recordAuditEvent("EXISTING_APP_IMPORT_SUCCEEDED", {
      requestId: lease.appRequestId,
      repositoryImportId: lease.repositoryImportId,
      attemptId: lease.attemptId,
      targetRepository: `${repository.owner}/${repository.name}`,
    });
    await deps.notifyAppEvent({
      appRequestId: lease.appRequestId,
      eventKey: "EXISTING_APP_IMPORTED",
      actorUserId: context.repositoryImport.appRequest.userId,
      directRecipientUserIds: [context.repositoryImport.appRequest.userId],
    });
    deps.log("succeeded", { ...logDetails, stage: "COMPLETE" });
    return { disposition: "complete", result: "succeeded" };
  } catch (error) {
    if (error instanceof LeaseLostError) {
      return { disposition: "complete", result: "already-terminal" };
    }

    currentStage = stageForError(error, currentStage);
    const errorSummary = sanitizeRunnerError(error);
    if (isTransientError(error)) {
      const released = await releaseTransientFailure({
        deps,
        lease,
        stage: currentStage,
        errorSummary,
        now: deps.now(),
      });
      if (!released) {
        return { disposition: "complete", result: "already-terminal" };
      }
      await deps.recordAuditEvent("EXISTING_APP_IMPORT_TRANSIENT", {
        requestId: lease.appRequestId,
        repositoryImportId: lease.repositoryImportId,
        attemptId: lease.attemptId,
        stage: currentStage,
        error: errorSummary,
      });
      deps.log("released", {
        ...logDetails,
        stage: currentStage,
        errorSummary,
        errorDiagnostics: safeErrorDiagnostics(error),
      });
      return { disposition: "abandon", errorSummary };
    }

    const terminal = await finalizeTerminalFailure({
      deps,
      lease,
      stage: currentStage,
      errorSummary,
      now: deps.now(),
    });
    if (terminal) {
      await deps.recordAuditEvent("EXISTING_APP_IMPORT_FAILED", {
        requestId: lease.appRequestId,
        repositoryImportId: lease.repositoryImportId,
        attemptId: lease.attemptId,
        stage: currentStage,
        error: errorSummary,
      });
      await deps.notifyAppEvent({
        appRequestId: lease.appRequestId,
        eventKey: "REPOSITORY_FAILED",
        actorUserId: context.repositoryImport.appRequest.userId,
        directRecipientUserIds: [context.repositoryImport.appRequest.userId],
      });
    }
    deps.log("failed", {
      ...logDetails,
      stage: currentStage,
      errorSummary,
      errorDiagnostics: safeErrorDiagnostics(error),
    });
    return { disposition: "dead-letter", errorSummary };
  }
}

function activeLeaseWhere(lease: ImportAttemptLease, now: Date) {
  return {
    id: lease.attemptId,
    status: "RUNNING" as const,
    workerExecutionName: lease.workerExecutionName,
    leaseExpiresAt: { gt: now },
  };
}

async function persistTargetBeforeClone(input: {
  deps: RepositoryImportRunnerDeps;
  lease: ImportAttemptLease;
  targetRepository: RepositoryMetadata;
  now: Date;
}) {
  await input.deps.db.$transaction(async (tx) => {
    const owned = await tx.repositoryImportAttempt.updateMany({
      where: activeLeaseWhere(input.lease, input.now),
      data: { stage: "CREATE_TARGET", lastHeartbeatAt: input.now },
    });
    if (owned.count !== 1) throw new LeaseLostError();

    await tx.repositoryImport.updateMany({
      where: {
        id: input.lease.repositoryImportId,
        activeAttemptId: input.lease.attemptId,
      },
      data: {
        targetRepositoryUrl: input.targetRepository.url,
        targetRepositoryDefaultBranch: input.targetRepository.defaultBranch,
      },
    });
    await tx.appRequest.updateMany({
      where: { id: input.lease.appRequestId },
      data: {
        repositoryUrl: input.targetRepository.url,
        repositoryDefaultBranch: input.targetRepository.defaultBranch,
      },
    });
  });
}

async function completeSuccess(input: {
  deps: RepositoryImportRunnerDeps;
  lease: ImportAttemptLease;
  repository: RepositoryMetadata;
  now: Date;
}) {
  return input.deps.db.$transaction(async (tx) => {
    const attempt = await tx.repositoryImportAttempt.updateMany({
      where: activeLeaseWhere(input.lease, input.now),
      data: {
        status: "SUCCEEDED",
        stage: "COMPLETE",
        errorSummary: null,
        finishedAt: input.now,
        leaseExpiresAt: null,
      },
    });
    if (attempt.count !== 1) return false;

    await tx.repositoryImport.updateMany({
      where: {
        id: input.lease.repositoryImportId,
        activeAttemptId: input.lease.attemptId,
      },
      data: {
        activeAttemptId: null,
        targetRepositoryUrl: input.repository.url,
        targetRepositoryDefaultBranch: input.repository.defaultBranch,
        importStatus: "SUCCEEDED",
        importErrorSummary: null,
        preparationStatus: "PENDING_USER_CHOICE",
        preparationErrorSummary: null,
      },
    });
    await tx.appRequest.updateMany({
      where: { id: input.lease.appRequestId },
      data: {
        repositoryUrl: input.repository.url,
        repositoryDefaultBranch: input.repository.defaultBranch,
        repositoryStatus: "READY",
        publishErrorSummary: null,
      },
    });
    return true;
  });
}

async function releaseTransientFailure(input: {
  deps: RepositoryImportRunnerDeps;
  lease: ImportAttemptLease;
  stage: RepositoryImportAttemptStage;
  errorSummary: string;
  now: Date;
}) {
  return input.deps.db.$transaction(async (tx) => {
    const attempt = await tx.repositoryImportAttempt.updateMany({
      where: activeLeaseWhere(input.lease, input.now),
      data: {
        status: "PENDING",
        stage: input.stage,
        errorSummary: input.errorSummary,
        workerExecutionName: null,
        leaseExpiresAt: null,
      },
    });
    if (attempt.count !== 1) return false;
    await tx.repositoryImport.updateMany({
      where: {
        id: input.lease.repositoryImportId,
        activeAttemptId: input.lease.attemptId,
      },
      data: { importStatus: "PENDING", importErrorSummary: null },
    });
    return true;
  });
}

async function finalizeTerminalFailure(input: {
  deps: RepositoryImportRunnerDeps;
  lease: ImportAttemptLease;
  stage: RepositoryImportAttemptStage;
  errorSummary: string;
  now: Date;
}) {
  return input.deps.db.$transaction(async (tx) => {
    const attempt = await tx.repositoryImportAttempt.updateMany({
      where: activeLeaseWhere(input.lease, input.now),
      data: {
        status: "FAILED",
        stage: input.stage,
        errorSummary: input.errorSummary,
        finishedAt: input.now,
        leaseExpiresAt: null,
      },
    });
    if (attempt.count !== 1) return false;
    await tx.repositoryImport.updateMany({
      where: {
        id: input.lease.repositoryImportId,
        activeAttemptId: input.lease.attemptId,
      },
      data: {
        activeAttemptId: null,
        importStatus: "FAILED",
        importErrorSummary: input.errorSummary,
        preparationStatus: "BLOCKED",
        preparationErrorSummary: input.errorSummary,
      },
    });
    await tx.appRequest.updateMany({
      where: { id: input.lease.appRequestId },
      data: {
        repositoryStatus: "FAILED",
        publishErrorSummary: input.errorSummary,
      },
    });
    return true;
  });
}

function stageForError(
  error: unknown,
  fallback: RepositoryImportAttemptStage,
): RepositoryImportAttemptStage {
  if (!(error instanceof RepositoryImportError)) return fallback;
  const stages: Record<RepositoryImportError["stage"], RepositoryImportAttemptStage> = {
    "create-target": "CREATE_TARGET",
    "target-token": "TARGET_TOKEN",
    "source-token": "SOURCE_TOKEN",
    clone: "CLONE",
    push: "PUSH",
    "set-default-branch": "SET_DEFAULT_BRANCH",
  };
  return stages[error.stage];
}

function errorChain(error: unknown) {
  const chain: unknown[] = [];
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    chain.push(current);
    current =
      current instanceof Error && "cause" in current ? current.cause : undefined;
  }
  return chain;
}

function safeErrorDiagnostics(error: unknown) {
  return errorChain(error).map((item) => {
    const record = item && typeof item === "object" ? item : null;
    const status = record && "status" in record ? Number(record.status) : Number.NaN;
    const rawCode = record && "code" in record ? String(record.code) : "";
    const code = /^[A-Za-z0-9_.-]{1,64}$/.test(rawCode) ? rawCode : undefined;
    const rawName = item instanceof Error ? item.name : "UnknownError";
    const name = /^[A-Za-z0-9_.-]{1,64}$/.test(rawName)
      ? rawName
      : "UnknownError";

    return {
      name,
      ...(Number.isFinite(status) ? { status } : {}),
      ...(code ? { code } : {}),
    };
  });
}

function isTransientError(error: unknown) {
  return errorChain(error).some((item) => {
    if (!item || typeof item !== "object") return false;
    const status = "status" in item ? Number(item.status) : Number.NaN;
    const code = "code" in item ? String(item.code) : "";
    return (
      status === 408 ||
      status === 429 ||
      status >= 500 ||
      ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(code)
    );
  });
}

function sanitizeRunnerError(error: unknown) {
  const safeBase =
    error instanceof RepositoryImportError
      ? error.message
      : "Repository import failed while communicating with GitHub.";
  return safeBase
    .replaceAll(/https:\/\/[^@\s]+@/gi, "https://")
    .replaceAll(/\b(token|secret|password)=\S+/gi, "$1=[redacted]")
    .slice(0, 600);
}
