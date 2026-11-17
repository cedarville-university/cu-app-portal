import { z } from "zod";
import { prisma } from "@/lib/db";
import { appAccessWhere } from "@/features/app-requests/access";
import { PortalApiError } from "@/features/portal-api/errors";
import { createImportGitHubClient } from "./github-client";
import { buildImportLoginGuidance, importLoginSettings } from "./import-login-guidance";
import { inspectImportedLoginSource, LOGIN_SOURCE_PATHS, type LoginSourceFinding } from "./login-review-source";
import { AZURE_DEPLOY_WORKFLOW_PATH, supportsReviewedCommitCheckout } from "@/features/publishing/workflow-triggers";

type Actor = { userId: string; isAdmin: boolean };
type ReviewApp = { id: string; appName: string; sourceOfTruth: string; submittedConfig: unknown; repositoryStatus: string; repositoryOwner: string | null; repositoryName: string | null; repositoryDefaultBranch: string | null; repositoryUrl: string | null; lastPublishedAt?: Date | null; publishedAt?: Date | null; publishStatus?: string; publishAttempts?: { status: string }[]; repositoryImport?: { preparationStatus: string } | null };
const sourcePath = z.string().max(180).regex(/^(?!\/)(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9_@()[\]./-]+\.(?:[cm]?[jt]sx?|py)$/)
  .refine(path => !path.split("/").some(part => part === ".." || part.startsWith(".")), "Use an application source file.");
export const loginReviewInputSchema = z.object({
  appId: z.string().min(1).max(128), commitSha: z.string().regex(/^[a-f0-9]{40}$/),
  sourcePaths: z.array(sourcePath).min(1).max(12), checksConfirmed: z.literal(true),
}).strict();
type ReviewInput = z.infer<typeof loginReviewInputSchema>;
export type ImportedLoginReview = {
  status: "NOT_REQUIRED" | "NEEDS_REVIEW" | "REVIEWED" | "UNAVAILABLE";
  commitSha: string | null; sourcePaths: string[]; findings: LoginSourceFinding[];
  evidence: string;
  publishingUpdateRequired?: boolean;
  canRefreshPublishing?: boolean;
};
const EVIDENCE = "Source inspection and actor-confirmed code/test review only; not live authentication or browser classification verification.";

export function needsImportedLoginReview(app: Pick<ReviewApp, "sourceOfTruth" | "lastPublishedAt" | "publishedAt" | "publishStatus" | "publishAttempts"> & { submittedConfig?: unknown }) {
  return app.sourceOfTruth === "IMPORTED_REPOSITORY" && !app.lastPublishedAt && !app.publishedAt && app.publishStatus !== "SUCCEEDED" && !app.publishAttempts?.some(attempt => attempt.status === "SUCCEEDED") && importLoginSettings(app.submittedConfig).enabled;
}
const successfulPublishes = { publishAttempts: { where: { status: "SUCCEEDED" as const }, take: 1, select: { status: true } }, repositoryImport: { select: { preparationStatus: true } } };
async function accessibleApp(actor: Actor, appId: string) {
  const app = await prisma.appRequest.findFirst({ where: appAccessWhere(appId, actor.userId, actor.isAdmin), include: successfulPublishes });
  if (!app) throw new PortalApiError("NOT_FOUND", "App not found.");
  return app;
}
export async function getImportLoginGuidance(actor: Actor, appId: string) {
  return buildImportLoginGuidance(await accessibleApp(actor, appId));
}
function identity(app: ReviewApp) {
  if (!app.repositoryOwner || !app.repositoryName || !app.repositoryDefaultBranch || app.repositoryStatus !== "READY") {
    throw new PortalApiError("ACTION_REQUIRED", "The managed repository must be ready before sign-in can be reviewed.");
  }
  return { owner: app.repositoryOwner, name: app.repositoryName, branch: app.repositoryDefaultBranch };
}
async function inspect(app: ReviewApp, extraPaths: string[] = []) {
  const target = identity(app);
  const github = createImportGitHubClient(target.owner);
  const head = await github.getBranchHead(target);
  const files = await github.readRepositoryTextFiles({ owner: target.owner, name: target.name, ref: head.sha, paths: [...new Set([...LOGIN_SOURCE_PATHS, AZURE_DEPLOY_WORKFLOW_PATH, ...extraPaths])] });
  return { target, github, sha: head.sha, files, ...inspectImportedLoginSource(files, importLoginSettings(app.submittedConfig).framework) };
}
async function reviewSnapshot(app: ReviewApp): Promise<ImportedLoginReview> {
  if (!needsImportedLoginReview(app)) return { status: "NOT_REQUIRED", commitSha: null, sourcePaths: [], findings: [], evidence: EVIDENCE };
  try {
    const snapshot = await inspect(app);
    const match = { appId: app.id, commitSha: snapshot.sha, repositoryOwner: snapshot.target.owner, repositoryName: snapshot.target.name, branch: snapshot.target.branch, method: "actor_confirmed_code_and_tests", version: 1 };
    const review = await prisma.auditLog.findFirst({ where: { event: "IMPORTED_LOGIN_REVIEWED", AND: Object.entries(match).map(([key, value]) => ({ details: { path: [key], equals: value } })) }, orderBy: { createdAt: "desc" }, select: { id: true } });
    return { status: review ? "REVIEWED" : "NEEDS_REVIEW", commitSha: snapshot.sha, sourcePaths: snapshot.sourcePaths.slice(0, 12), findings: snapshot.findings, publishingUpdateRequired: !supportsReviewedCommitCheckout(snapshot.files[AZURE_DEPLOY_WORKFLOW_PATH] ?? "", true), canRefreshPublishing: app.repositoryImport?.preparationStatus === "COMMITTED", evidence: EVIDENCE };
  } catch {
    return { status: "UNAVAILABLE", commitSha: null, sourcePaths: [], findings: [], evidence: "Sign-in source or review evidence could not be checked. Retry when available; this is not an approval." };
  }
}
export async function getImportedLoginReview(actor: Actor, appId: string) {
  return reviewSnapshot(await accessibleApp(actor, appId));
}
export async function reviewImportedAppLogin(actor: Actor, rawInput: unknown) {
  const parsed = loginReviewInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new PortalApiError("INVALID_INPUT", "Confirm the sign-in checks, current commit, and application source files reviewed.");
  const input: ReviewInput = parsed.data;
  const app = await accessibleApp(actor, input.appId);
  if (!needsImportedLoginReview(app)) throw new PortalApiError("ACTION_REQUIRED", "This app does not require a first-publish sign-in review.");
  const snapshot = await inspect(app, input.sourcePaths);
  if (snapshot.sha !== input.commitSha) throw new PortalApiError("CONFLICT", "The app code changed. Review the current commit before confirming sign-in.");
  if (input.sourcePaths.some(path => !snapshot.files[path]?.trim())) throw new PortalApiError("ACTION_REQUIRED", "Some reviewed source files are missing from the current commit.");
  const current = await accessibleApp(actor, input.appId);
  const target = identity(current);
  if (!needsImportedLoginReview(current) || JSON.stringify(target) !== JSON.stringify(snapshot.target) ||
      (await snapshot.github.getBranchHead(target)).sha !== input.commitSha) throw new PortalApiError("CONFLICT", "The app changed during review. Check its current sign-in state again.");
  await prisma.auditLog.create({ data: { event: "IMPORTED_LOGIN_REVIEWED", details: {
    version: 1, appId: app.id, actorUserId: actor.userId, commitSha: input.commitSha,
    repositoryOwner: target.owner, repositoryName: target.name, branch: target.branch,
    method: "actor_confirmed_code_and_tests", sourcePaths: [...new Set(input.sourcePaths)],
  } } });
  return { appId: app.id, status: "REVIEWED" as const, commitSha: input.commitSha, evidence: EVIDENCE };
}
export async function assertImportedLoginReviewForFirstPublish(appId: string) {
  const app = await prisma.appRequest.findUnique({ where: { id: appId }, include: successfulPublishes });
  if (!app) throw new PortalApiError("NOT_FOUND", "App not found.");
  const review = await reviewSnapshot(app);
  if (review.status === "NOT_REQUIRED") return null;
  if (review.publishingUpdateRequired) throw new PortalApiError("ACTION_REQUIRED", "This app needs reviewed publishing preparation before first publish. Open a publishing update review in CU Launch, or use prepare_imported_app with PULL_REQUEST, merge the review, then verify preparation and review sign-in at the new commit.");
  if (review.status !== "REVIEWED" || !review.commitSha) throw new PortalApiError("ACTION_REQUIRED", "Review and test this imported app's sign-in before its first publish. Open its sign-in review in CU Launch or use get_app_import_status and review_imported_app_login.");
  return review.commitSha;
}
