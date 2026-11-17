import { prisma } from "@/lib/db";
import { appAccessWhere } from "@/features/app-requests/access";
import { PortalApiError } from "@/features/portal-api/errors";
import { scanRepositoryCompatibility } from "./compatibility";
import { importedFeaturesIssue, savedImportedFeatures } from "./features";
import { IMPORT_COMPATIBILITY_READ_PATHS } from "./prepare-repository";
import { createGitHubClientForOwner, type ImportActor } from "./service";
import { buildImportLoginGuidance } from "./import-login-guidance";
import { getImportedLoginReview } from "./login-review";

export async function getAppImportStatus(actor: ImportActor, appId: string) {
  const app = await prisma.appRequest.findFirst({
    where: appAccessWhere(appId, actor.userId, actor.isAdmin),
    include: { repositoryImport: true },
  });
  if (!app) throw new PortalApiError("NOT_FOUND", "App not found.");
  const imported = app.repositoryImport;
  if (!imported) throw new PortalApiError("ACTION_REQUIRED", "This app does not have an import workflow.");
  // Scan only before preparation. Generated publishing files naturally conflict
  // with an initial-import scan; committed readiness has a separate verifier.
  let compatibility = null;
  let compatibilityCheck: "scanned" | "not_scanned" | "unavailable" = "not_scanned";
  if (app.repositoryStatus === "READY" && app.repositoryOwner && app.repositoryName && app.repositoryDefaultBranch &&
    !["COMMITTED", "PULL_REQUEST_OPENED", "RUNNING"].includes(imported.preparationStatus)) {
    try {
    const github = createGitHubClientForOwner(app.repositoryOwner);
    const target = { owner: app.repositoryOwner, name: app.repositoryName };
    const head = await github.getBranchHead({ ...target, branch: app.repositoryDefaultBranch });
    const files = await github.readRepositoryTextFiles({ ...target, ref: head.sha, paths: IMPORT_COMPATIBILITY_READ_PATHS });
    const scan = scanRepositoryCompatibility(files);
    const features = savedImportedFeatures(app.submittedConfig);
    compatibility = {
      ...scan,
      findings: scan.findings.slice(0, 50),
      commitSha: head.sha,
      serviceIssue: features ? importedFeaturesIssue(scan.runtime, features) : null,
    };
    compatibilityCheck = "scanned";
    } catch { compatibilityCheck = "unavailable"; }
  }
  const loginReview = await getImportedLoginReview(actor, appId);
  return {
    loginGuidance: buildImportLoginGuidance(app), loginReview,
    appId, importStatus: imported.importStatus, repositoryStatus: app.repositoryStatus,
    preparationStatus: imported.preparationStatus, preparationMode: imported.preparationMode,
    preparationPullRequestUrl: imported.preparationPullRequestUrl,
    recordedCompatibilityStatus: imported.compatibilityStatus, compatibility, compatibilityCheck,
    diagnostics: safeImportDiagnostics(imported),
    needsAttention: ["FAILED", "BLOCKED"].includes(imported.preparationStatus) || imported.importStatus === "FAILED" || ["NEEDS_REVIEW", "UNAVAILABLE"].includes(loginReview.status) || loginReview.publishingUpdateRequired === true,
    updatedAt: imported.updatedAt.toISOString(),
    evidence: compatibility ? "Live compatibility scan of the identified commit; other fields are recorded portal state." : "Recorded portal state; no fresh compatibility scan or live deployment check.",
  };
}


// Persisted summaries can contain provider text or application-controlled data.
// Return fixed explanations selected by category, never the original string.
function safeImportDiagnostics(imported: {
  importStatus: string;
  preparationStatus: string;
  preparationErrorSummary: string | null;
}) {
  const diagnostics: Array<{ code: string; message: string }> = [];
  if (imported.importStatus === "FAILED") diagnostics.push({ code: "IMPORT_FAILED", message: "Repository import failed. Open CU Launch to review the import and approve a retry; keep this app ID." });
  const error = imported.preparationErrorSummary ?? "";
  if (error.startsWith("GitHub App authentication failed")) diagnostics.push({ code: "GITHUB_APP_AUTHENTICATION", message: "An administrator must check the portal GitHub App authentication and installation before another preparation attempt." });
  else if (error.startsWith("GitHub App permissions are missing")) diagnostics.push({ code: "GITHUB_APP_PERMISSIONS", message: "An administrator must grant the GitHub App repository contents and pull request access before preparation can continue." });
  else if (error.startsWith("Missing publishing files on default branch:")) diagnostics.push({ code: "PUBLISHING_FILES_MISSING", message: "The default branch is missing publishing files. Confirm the preparation review was merged into the managed default branch, then request verification again." });
  else if (error.startsWith("Repository is not ready for publishing:")) diagnostics.push({ code: "RUNTIME_REQUIREMENTS", message: "Default-branch runtime requirements are incomplete. Check the merged publishing review and application build/start configuration before verification." });
  else if (error.startsWith("Repository has publishing file conflicts.")) diagnostics.push({ code: "PUBLISHING_FILE_CONFLICTS", message: "Existing publishing files require an approved review PR; direct preparation will not overwrite them." });
  else if (error.startsWith("Repository is not compatible") || error.startsWith("This app needs a supported server")) diagnostics.push({ code: "COMPATIBILITY_BLOCKED", message: "Resolve the compatibility or service-integration findings before requesting preparation again; architecture changes require approval." });
  else if (error || ["FAILED", "BLOCKED"].includes(imported.preparationStatus)) diagnostics.push({ code: "PREPARATION_INCOMPLETE", message: "Preparation is incomplete. Check actor-specific repository access and review publishing setup in CU Launch before a new attempt." });
  return diagnostics;
}
