import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { PortalActor } from "@/features/portal-api/principal";
import { PortalApiError } from "@/features/portal-api/errors";
import { assertPortalAdmin } from "./guard";
import { adminListAppsSchema, adminFindUsersSchema, adminDebugAppSchema, parseAdminInput, type AdminListAppsInput, type AdminFindUsersInput, type AdminDebugAppInput } from "./schemas";
import { redactDiagnosticText } from "./redaction";
const ownerSelect = {
  id: true, displayName: true, email: true
} as const;
const summarySelect = {
  id: true, appName: true, user: { select: ownerSelect }, template: { select: { slug: true, name: true } }, sourceOfTruth: true, generationStatus: true, repositoryStatus: true, publishingSetupStatus: true, publishStatus: true, repositoryUrl: true, publishUrl: true, primaryPublishUrl: true, supportReference: true, createdAt: true, updatedAt: true
} satisfies Prisma.AppRequestSelect;
type SummaryRecord = Prisma.AppRequestGetPayload<{
  select: typeof summarySelect;
}>;
function summary(app: SummaryRecord) {
  return {
    id: app.id, appName: app.appName, owner: {
      id: app.user.id, displayName: app.user.displayName, email: app.user.email
    }, template: { slug: app.template.slug, name: app.template.name }, sourceOfTruth: app.sourceOfTruth, generationStatus: app.generationStatus, repositoryStatus: app.repositoryStatus, publishingSetupStatus: app.publishingSetupStatus, publishStatus: app.publishStatus, repositoryUrl: app.repositoryUrl, liveUrl: app.publishUrl ?? app.primaryPublishUrl, supportReference: app.supportReference, createdAt: app.createdAt, updatedAt: app.updatedAt
  };
}
export async function adminListApps(actor: PortalActor, input: AdminListAppsInput, db = prisma) {
  assertPortalAdmin(actor);
  const { query, ownerUserId, offset, limit } = parseAdminInput(adminListAppsSchema, input);
  const apps = await db.appRequest.findMany({
    where: { ...(ownerUserId ? { userId: ownerUserId } : {}), ...(query ? { OR: [{ appName: { contains: query, mode: "insensitive" as const } }, { supportReference: { contains: query, mode: "insensitive" as const } }] } : {}) }, select: summarySelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: offset, take: limit + 1
  });
  return { apps: apps.slice(0, limit).map(summary), nextOffset: apps.length > limit ? offset + limit : null };
}
export async function adminFindUsers(actor: PortalActor, input: AdminFindUsersInput, db = prisma) {
  assertPortalAdmin(actor);
  const { query, offset, limit } = parseAdminInput(adminFindUsersSchema, input);
  const users = await db.user.findMany({
    where: query ? { OR: [{ displayName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }, { githubUsername: { contains: query, mode: "insensitive" } }] } : {}, select: { ...ownerSelect, githubUsername: true }, orderBy: [{ displayName: "asc" }, { email: "asc" }, { id: "asc" }], skip: offset, take: limit + 1
  });
  return { users: users.slice(0, limit).map(user => ({
      id: user.id, displayName: user.displayName, email: user.email, username: user.email.split("@")[0], githubUsername: user.githubUsername
    })), nextOffset: users.length > limit ? offset + limit : null };
}
const safeMessage = (value: string | null) => value == null ? null : redactDiagnosticText(value).slice(0, 2000);
export async function adminDebugApp(actor: PortalActor, input: AdminDebugAppInput, db = prisma) {
  assertPortalAdmin(actor);
  const { appId } = parseAdminInput(adminDebugAppSchema, input);
  const app = await db.appRequest.findUnique({ where: { id: appId }, select: {
      ...summarySelect, repositoryDefaultBranch: true, publishErrorSummary: true, publishWarningSummary: true, publishingSetupErrorSummary: true, publishingSetupCheckedAt: true, publishingSetupRepairedAt: true, repositoryImport: { select: {
          importStatus: true, importErrorSummary: true, compatibilityStatus: true, preparationStatus: true, preparationErrorSummary: true, preparationPullRequestUrl: true, updatedAt: true
        } }, publishSetupChecks: { orderBy: { checkKey: "asc" }, select: {
          checkKey: true, status: true, message: true, checkedAt: true
        } }, publishAttempts: {
        take: 10, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: {
          id: true, status: true, stage: true, errorSummary: true, createdAt: true, startedAt: true, finishedAt: true, githubWorkflowRunId: true, githubWorkflowRunUrl: true, deploymentStartedAt: true, verifiedAt: true, workerHeartbeatAt: true, workerLeaseExpiresAt: true
        }
      }
    } });
  if (!app)
    throw new PortalApiError("NOT_FOUND", "App not found.");
  const ri = app.repositoryImport;
  return {
    app: summary(app), evidence: "Recorded portal state; no live provider checks performed.", repositoryDefaultBranch: app.repositoryDefaultBranch, publishErrorSummary: safeMessage(app.publishErrorSummary), publishWarningSummary: safeMessage(app.publishWarningSummary), publishingSetupErrorSummary: safeMessage(app.publishingSetupErrorSummary), publishingSetupCheckedAt: app.publishingSetupCheckedAt, publishingSetupRepairedAt: app.publishingSetupRepairedAt,
    repositoryImport: ri ? {
      importStatus: ri.importStatus, importErrorSummary: safeMessage(ri.importErrorSummary), compatibilityStatus: ri.compatibilityStatus, preparationStatus: ri.preparationStatus, preparationErrorSummary: safeMessage(ri.preparationErrorSummary), preparationPullRequestUrl: ri.preparationPullRequestUrl, updatedAt: ri.updatedAt
    } : null,
    setupChecks: app.publishSetupChecks.map(c => ({
      checkKey: c.checkKey, status: c.status, message: safeMessage(c.message), checkedAt: c.checkedAt
    })),
    attempts: app.publishAttempts.map(a => ({
      id: a.id, status: a.status, stage: a.stage, errorSummary: safeMessage(a.errorSummary), createdAt: a.createdAt, startedAt: a.startedAt, finishedAt: a.finishedAt, githubWorkflowRunId: a.githubWorkflowRunId, workflowUrl: a.githubWorkflowRunUrl, deploymentStartedAt: a.deploymentStartedAt, verifiedAt: a.verifiedAt, workerHeartbeatAt: a.workerHeartbeatAt, workerLeaseExpiresAt: a.workerLeaseExpiresAt
    }))
  };
}
