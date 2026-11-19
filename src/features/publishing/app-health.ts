import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { probeMcpDeployment } from "@/features/mcp-servers/deployment-probe";
import { verifyPublishedUrl } from "./azure/verify-deployment";
import { recoveredWarning, type RecoveryAttempt } from "./recovery";
import { inspectHealthWorkflow, type HealthWorkflowEvidence } from "./health-workflow";
import type { VerificationResult } from "./run-publish-attempt";

type HealthApp = Prisma.AppRequestGetPayload<{ include: {
  template: true; mcpConfiguration: true; publishAttempts: true;
} }>;
type HealthEvidence = {
  health(url: string, app: HealthApp): Promise<VerificationResult>;
  workflow: (attempt: RecoveryAttempt) => Promise<HealthWorkflowEvidence>;
};
const defaultEvidence: HealthEvidence = {
  workflow: inspectHealthWorkflow,
  async health(url, app) {
    if (app.template.slug !== "mcp-server") return verifyPublishedUrl(url, { timeoutMs: 5_000 });
    const config = app.mcpConfiguration;
    if (!config || new URL(config.endpointUrl).origin !== url) throw new Error("MCP endpoint does not match its managed deployment.");
    const result = await probeMcpDeployment(config, { maxAttempts: 1 });
    return { verifiedAt: result.checkedAt };
  },
};

// Health probes use only Azure's provisioned default hostname, never a user URL.
export function managedHealthUrl(app: { azureWebAppName?: string | null; azureDefaultHostName?: string | null }) {
  if (!app.azureWebAppName || !/^[a-zA-Z0-9-]+$/.test(app.azureWebAppName)) return null;
  const host = app.azureDefaultHostName ?? `${app.azureWebAppName}.azurewebsites.net`;
  if (!/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.azurewebsites\.net$/.test(host)) return null;
  return `https://${host.toLowerCase()}`;
}

export type HealthResult = "checked" | "recovered" | "skipped" | "superseded";
class HealthObservationSuperseded extends Error {}

export async function checkAppHealth(requestId: string, actorUserId?: string, evidence: HealthEvidence = defaultEvidence): Promise<HealthResult> {
  const app = await prisma.appRequest.findUnique({
    where: { id: requestId },
    include: { template: true, mcpConfiguration: true, publishAttempts: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } },
  });
  if (!app || !app.azureWebAppName || !["FAILED", "SUCCEEDED"].includes(app.publishStatus)) return "skipped";
  const url = managedHealthUrl(app);
  const checkedAt = new Date();
  let verification: VerificationResult | undefined;
  let healthSummary: string | null = null;
  try {
    if (!url) throw new Error("Managed deployment hostname is invalid.");
    verification = await evidence.health(url, app);
    healthSummary = verification.warningSummary ?? null;
  } catch {
    // Do not persist raw provider exceptions or response bodies.
    healthSummary = "The app did not pass its health check. It may be unavailable or still starting. Check the app and its deployment logs.";
  }
  const healthStatus = verification ? (healthSummary ? "WARNING" : "HEALTHY") : "UNHEALTHY";
  const attempt = app.publishAttempts[0];
  let recovered = false;
  let replacementRun: HealthWorkflowEvidence["replacementRun"];
  let recoveredAttemptId = attempt?.id;
  let reconciliationNote: string | null = null;
  if (verification && app.publishStatus === "FAILED") {
    if (attempt?.status === "FAILED") {
      try {
        const run = await evidence.workflow({ ...attempt, appRequest: app });
        replacementRun = run.replacementRun;
        recovered = run.status === "completed" && run.conclusion === "success";
        if (!recovered) reconciliationNote = "The app is responding, but the recorded GitHub deployment has not completed successfully. Publishing status is unchanged.";
      } catch {
        reconciliationNote = "The app is responding, but GitHub deployment status could not be verified. Publishing status is unchanged.";
      }
    } else {
      reconciliationNote = "The app is responding, but no failed GitHub run is recorded to verify recovery. Publishing status is unchanged.";
    }
  }
  try {
    await prisma.$transaction(async (tx) => {
      const latest = await tx.publishAttempt.findFirst({ where: { appRequestId: app.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, status: true } });
      if ((latest?.id ?? null) !== (attempt?.id ?? null) || (latest?.status ?? null) !== (attempt?.status ?? null)) throw new HealthObservationSuperseded();
      const saved = await tx.appRequest.updateMany({
        where: { id: app.id, updatedAt: app.updatedAt, publishStatus: app.publishStatus, healthCheckVersion: app.healthCheckVersion, azureWebAppName: app.azureWebAppName, azureDefaultHostName: app.azureDefaultHostName, primaryPublishUrl: app.primaryPublishUrl },
        data: {
          healthCheckVersion: { increment: 1 },
          healthStatus, healthCheckedAt: checkedAt, healthSummary: [healthSummary, reconciliationNote].filter(Boolean).join(" ").slice(0, 1500) || null,
          ...(recovered ? {
            publishStatus: "SUCCEEDED", publishErrorSummary: null,
            publishUrl: app.primaryPublishUrl ?? app.publishUrl ?? url,
            publishWarningSummary: recoveredWarning(app, verification?.warningSummary),
          } : {}),
        },
      });
      if (saved.count !== 1) throw new HealthObservationSuperseded();
      if (recovered && replacementRun) {
        // Preserve the failed attempt; this success came from another GitHub run.
        const observed = await tx.publishAttempt.create({ data: {
          appRequestId: app.id, status: "SUCCEEDED", stage: "COMPLETED",
          githubWorkflowRunId: replacementRun.id, githubWorkflowRunUrl: replacementRun.url,
          startedAt: replacementRun.startedAt, verifiedAt: verification!.verifiedAt,
        } });
        recoveredAttemptId = observed.id;
      } else if (recovered && attempt) {
        const savedAttempt = await tx.publishAttempt.updateMany({
          where: { id: attempt.id, status: "FAILED", githubWorkflowRunId: attempt.githubWorkflowRunId },
          // Retain historical completion time; this is a verification observation.
          data: { status: "SUCCEEDED", stage: "COMPLETED", errorSummary: null, verifiedAt: verification!.verifiedAt },
        });
        if (savedAttempt.count !== 1) throw new HealthObservationSuperseded();
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof HealthObservationSuperseded || (error && typeof error === "object" && "code" in error && error.code === "P2034")) return "superseded";
    throw error;
  }
  await recordAuditEvent(recovered ? "PUBLISH_RECOVERED" : "APP_HEALTH_CHECKED", {
    appRequestId: app.id, actorUserId, supportReference: app.supportReference,
    healthStatus, checkedAt: checkedAt.toISOString(),
    ...(recovered ? { publishAttemptId: recoveredAttemptId, previousPublishAttemptId: replacementRun ? attempt?.id : undefined, workflowRunId: replacementRun?.id ?? attempt!.githubWorkflowRunId, outcome: "SUCCEEDED", reason: "Health check confirmed a successful GitHub deployment; no deployment was started." } : {}),
  });
  return recovered ? "recovered" : "checked";
}

export async function checkDueAppHealth(now = new Date()) {
  const apps = await prisma.appRequest.findMany({
    where: {
      publishStatus: { in: ["FAILED", "SUCCEEDED"] }, azureWebAppName: { not: null },
      OR: [
        { healthCheckedAt: null },
        { healthStatus: "HEALTHY", healthCheckedAt: { lte: new Date(now.getTime() - 2 * 60 * 60_000) } },
        { healthStatus: { not: "HEALTHY" }, healthCheckedAt: { lte: new Date(now.getTime() - 5 * 60_000) } },
      ],
    },
    orderBy: [{ healthCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 20, select: { id: true },
  });
  const results: Record<string, number> = {};
  // Four bounded lanes keep a batch within the recovery job's execution budget.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, apps.length) }, async () => {
    while (next < apps.length) {
      const app = apps[next++];
      try {
        const result = await checkAppHealth(app.id);
        results[result] = (results[result] ?? 0) + 1;
      } catch {
        results.errors = (results.errors ?? 0) + 1;
        console.error("App health check could not be saved.", { appRequestId: app.id });
      }
    }
  }));
  return results;
}
