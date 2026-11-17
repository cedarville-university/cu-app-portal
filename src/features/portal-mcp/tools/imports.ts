import { z } from "zod";
import { adoptionInputSchema } from "@/features/repository-imports/adoption";
import { loginReviewInputSchema } from "@/features/repository-imports/login-review";
import { portalMcpInputSchema, portalToolFailure, portalToolSuccess } from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

const appInput = z.object({ appId: z.string().min(1).max(128) }).strict();
const mutationInput = appInput.extend({ idempotencyKey: z.string().uuid() });
const prepareInput = mutationInput.extend({ mode: z.enum(["DIRECT_COMMIT", "PULL_REQUEST"]) }).strict();
const reviewInput = loginReviewInputSchema.extend({ idempotencyKey: z.string().uuid() }).strict();

export function registerImportTools(server: PortalMcpServer, context: PortalMcpToolContext) {
  const actor = { ...context.actor, source: "codex-mcp" as const };
  server.registerTool("adopt_existing_app", {
    title: "Add Existing App to CU Launch",
    description: "Import an existing GitHub app, or omit repositoryUrl to create a private managed repository for local upload. Requires approved import choices and public acknowledgement when applicable. Never publishes. Reuse the identical UUID and choices after interruption; the durable app identity prevents duplicate provisioning.",
    inputSchema: portalMcpInputSchema(adoptionInputSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (input: z.infer<typeof adoptionInputSchema>) => {
    try {
      await context.claimPortalRateLimit(actor.userId, "adopt_existing_app");
      const result = await context.adoptExistingApp(actor, input);
      const app = await context.getAccessibleAppSummary(actor, result.requestId);
      const loginGuidance = await context.getImportLoginGuidance(actor, result.requestId);
      return portalToolSuccess({ ...result, app, loginGuidance }, "The adoption request is recorded. Follow the returned loginGuidance even if the app-local skill is missing. Check repository and import status; this has not published the app.");
    } catch (error) { return portalToolFailure(error); }
  });
  server.registerTool("get_app_import_status", {
    title: "Get App Import Status",
    description: "Read authorized import/preparation state and scan the actual managed repository at a pinned commit before preparation. Findings do not prove application behavior or deployment health.",
    inputSchema: portalMcpInputSchema(appInput),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async (input: z.infer<typeof appInput>) => {
    try {
      await context.claimPortalRateLimit(actor.userId, "read");
      return portalToolSuccess(await context.getAppImportStatus(actor, input.appId), "Import status checked.");
    } catch (error) { return portalToolFailure(error); }
  });
  server.registerTool("review_imported_app_login", {
    title: "Record Imported App Sign-in Review",
    description: "After inspecting and testing actual login code, confirm the review of the current managed commit. Read get_app_import_status first. checksConfirmed means the public login page, server-side sign-in, protected routes, safe returns, OAuth validation and relevant tests were reviewed. Never infer success from filenames or a build alone. Does not publish or certify live login/browser classification.",
    inputSchema: portalMcpInputSchema(reviewInput),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (input: z.infer<typeof reviewInput>) => {
    try {
      await context.getAccessibleAppSummary(actor, input.appId);
      const { idempotencyKey, ...choices } = input;
      const recordedReview = await context.executeIdempotentMutation({
        actorUserId: actor.userId, operation: "review_imported_app_login", idempotencyKey, input: choices,
        expiresInSeconds: 604800,
        claimRateLimit: () => context.claimPortalRateLimit(actor.userId, "review_imported_app_login"),
        execute: () => context.reviewImportedAppLogin(actor, choices),
        resultReferences: () => ({ appRequestId: input.appId }),
      });
      return portalToolSuccess({ recordedReview, status: await context.getAppImportStatus(actor, input.appId) }, "Review confirmation recorded for the requested commit. The returned current status can require another review if code changed. Nothing was published.");
    } catch (error) { return portalToolFailure(error); }
  });
  server.registerTool("prepare_imported_app", {
    title: "Prepare Imported App",
    description: "After approved upload/import and repository access, add publishing support by direct commit or a review PR. Scans actual remote code and stops on unsupported architecture. Does not migrate app architecture or publish. Include setup resource provisioning in import approval.",
    inputSchema: portalMcpInputSchema(prepareInput),
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async (input: z.infer<typeof prepareInput>) => {
    try {
      // Always authorize before looking up a cached result.
      await context.getAccessibleAppSummary(actor, input.appId);
      const { idempotencyKey, ...choices } = input;
      const result = await context.executeIdempotentMutation({
        actorUserId: actor.userId, operation: "prepare_imported_app", idempotencyKey, input: choices,
        expiresInSeconds: 604800,
        claimRateLimit: () => context.claimPortalRateLimit(actor.userId, "prepare_imported_app"),
        execute: async () => {
          const form = new FormData(); form.set("preparationMode", input.mode);
          await context.prepareExistingAppForActor(actor, input.appId, form);
          return { appId: input.appId };
        }, resultReferences: () => ({ appRequestId: input.appId }),
      });
      return portalToolSuccess({ ...result, status: await context.getAppImportStatus(actor, input.appId) }, "Preparation checked. Review its status; preparation is separate from publishing.");
    } catch (error) { return portalToolFailure(error); }
  });
  server.registerTool("verify_imported_app", {
    title: "Verify Imported App Preparation",
    description: "After the user confirms their publishing review was merged, verify default-branch readiness and complete publishing setup. Never publishes. A new deliberate verification uses a new UUID; uncertain response replays reuse it.",
    inputSchema: portalMcpInputSchema(mutationInput),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (input: z.infer<typeof mutationInput>) => {
    try {
      await context.getAccessibleAppSummary(actor, input.appId);
      const result = await context.executeIdempotentMutation({
        actorUserId: actor.userId, operation: "verify_imported_app", idempotencyKey: input.idempotencyKey,
        input: { appId: input.appId }, expiresInSeconds: 604800,
        claimRateLimit: () => context.claimPortalRateLimit(actor.userId, "verify_imported_app"),
        execute: async () => {
          await context.verifyExistingAppPreparationForActor(actor, input.appId);
          return { appId: input.appId };
        }, resultReferences: () => ({ appRequestId: input.appId }),
      });
      return portalToolSuccess({ ...result, status: await context.getAppImportStatus(actor, input.appId) }, "Default-branch preparation checked. The app has not been published by this operation.");
    } catch (error) { return portalToolFailure(error); }
  });
}
