import { NEXTJS_ENTRA_LOGIN_GUIDANCE, EXPRESS_ENTRA_LOGIN_GUIDANCE } from "@/features/repositories/entra-login-guidance";
import { buildLoginUpdatePrompt } from "@/features/repositories/codex-handoff";

export function importLoginSettings(config: unknown) {
  const value = config && typeof config === "object" ? config as Record<string, unknown> : {};
  const features = value.importFeatures as { entraLogin?: unknown } | undefined;
  const runtime = value.importRuntime as { framework?: unknown } | undefined;
  const framework = typeof runtime?.framework === "string" ? runtime.framework : null;
  const enabled = typeof value.entraLogin === "boolean" ? value.entraLogin
    : typeof features?.entraLogin === "boolean" ? features.entraLogin
      : framework === null || framework === "nextjs";
  return { enabled, framework };
}

export function buildImportLoginGuidance(app: { appName: string; repositoryUrl: string | null; submittedConfig: unknown }) {
  const { enabled, framework } = importLoginSettings(app.submittedConfig);
  if (!enabled) return { required: false, framework, requirements: [], updatePrompt: null, reviewInstructions: null };
  const requirements = framework === "express" ? [EXPRESS_ENTRA_LOGIN_GUIDANCE]
    : framework === "nextjs" ? [NEXTJS_ENTRA_LOGIN_GUIDANCE]
      : framework === "fastapi" ? ["Preserve FastAPI and its server-side Entra authorization-code flow, public /login page, registered callback, secure sessions, OAuth validation, and protected routes. Do not add Auth.js or migrate frameworks for this review."]
        : ["Inspect the actual framework before changing authentication. Apply only its matching requirements; preserve existing public routes and audience restrictions.", NEXTJS_ENTRA_LOGIN_GUIDANCE, EXPRESS_ENTRA_LOGIN_GUIDANCE];
  return {
    required: true, framework, requirements,
    updatePrompt: app.repositoryUrl
      ? framework === "nextjs" || framework === "express"
        ? buildLoginUpdatePrompt({ appName: app.appName, repositoryUrl: app.repositoryUrl, framework })
        : [`Inspect the actual framework and authentication of the existing ${JSON.stringify(app.appName)} app in its intended local project before editing. Verify the managed repository ${app.repositoryUrl} among its remotes. Preserve unrelated work, current framework, existing callbacks, public pages and audience restrictions. Never print secrets.`, ...requirements, "Run relevant authentication tests and the production build. Follow the project's authorization for commits, pushes and publishing; do not claim a browser warning is cleared without live testing."].join("\n\n")
      : null,
    reviewInstructions: "These requirements apply even when the app-local CU Launch skill is absent or customized. Before first publish, inspect and test the actual sign-in implementation. Read get_app_import_status for the current commit and loginReview findings. If publishingUpdateRequired is true, finish preparation first: for a COMMITTED app, obtain approval for a PULL_REQUEST refresh, use prepare_imported_app, wait for merge confirmation and verify_imported_app, then review the new commit; fix the default sign-in flow if present. After reviewing the public login page, server-side sign-in, protected routes, safe returns, OAuth validation, and passing relevant tests, use review_imported_app_login with that commitSha, the sourcePaths actually reviewed, and checksConfirmed: true. Do not claim checks passed if they were unavailable. A later code commit requires a new review. Review records code/test confirmation, not live Entra success or Google's classification. Publishing requires a separate explicit request.",
  };
}

export function buildImportedLoginReviewPrompt(app: Parameters<typeof buildImportLoginGuidance>[0]) {
  const guidance = buildImportLoginGuidance(app);
  return [guidance.updatePrompt, ...(!guidance.updatePrompt ? guidance.requirements : []), guidance.reviewInstructions,
    "Review the actual remote code after authorized changes are pushed and publishing preparation is finished. If that process adds another commit, review the new commit. If the CU Launch plugin is unavailable, summarize the exact checked commit, list up to 12 reviewed application source file paths one per line for the portal confirmation, report test results and remaining limitations, then ask the user to refresh CU Launch and confirm the sign-in review there using that source file list. Do not confirm tests that could not run or review only a local unpushed change."
  ].filter(Boolean).join("\n\n");
}
