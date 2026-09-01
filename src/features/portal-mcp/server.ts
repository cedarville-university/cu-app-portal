import { createMcpHandler } from "mcp-handler";
import { createGeneratedApp } from "@/features/app-requests/create-generated-app";
import { getAccessibleAppSummary, getAccessiblePublishAttemptSummary } from "@/features/app-requests/get-app-summary";
import { listAccessibleAppSummaries } from "@/features/app-requests/list-accessible-apps";
import { executeIdempotentMutation } from "@/features/portal-api/idempotency";
import type { PortalActor } from "@/features/portal-api/principal";
import { claimPortalRateLimit } from "@/features/portal-api/rate-limit";
import { queuePublishForActor } from "@/features/publishing/queue-publish";
import { retryPublishForActor } from "@/features/publishing/retry-publish";
import { repairPublishingSetupForActor } from "@/features/publishing/setup/repair-publishing-setup";
import { grantRepositoryAccessForActor } from "@/features/repositories/grant-repository-access";
import { getActiveTemplateBySlug } from "@/features/templates/catalog";
import { listPortalTemplateSummaries } from "@/features/templates/portal-api";
import { registerCreateAppTool } from "./tools/create-app";
import { registerGetAppTool } from "./tools/get-app";
import { registerGetPublishStatusTool } from "./tools/get-publish-status";
import { registerListAppTemplatesTool } from "./tools/list-app-templates";
import { registerListMyAppsTool } from "./tools/list-my-apps";
import { registerPublishAppToAzureTool } from "./tools/publish-app-to-azure";
import { registerRepairPublishingSetupTool } from "./tools/repair-publishing-setup";
import { registerRequestGitHubAccessTool } from "./tools/request-github-access";
import { registerRetryPublishTool } from "./tools/retry-publish";

type PortalMcpInitializer = Parameters<typeof createMcpHandler>[0];

export type PortalMcpServer = Parameters<PortalMcpInitializer>[0];

export type PortalMcpDependencies = {
  listPortalTemplateSummaries: typeof listPortalTemplateSummaries;
  listAccessibleAppSummaries: typeof listAccessibleAppSummaries;
  createGeneratedApp: typeof createGeneratedApp;
  getAccessibleAppSummary: typeof getAccessibleAppSummary;
  getAccessiblePublishAttemptSummary: typeof getAccessiblePublishAttemptSummary;
  grantRepositoryAccessForActor: typeof grantRepositoryAccessForActor;
  queuePublishForActor: typeof queuePublishForActor;
  repairPublishingSetupForActor: typeof repairPublishingSetupForActor;
  retryPublishForActor: typeof retryPublishForActor;
  getActiveTemplateBySlug: typeof getActiveTemplateBySlug;
  executeIdempotentMutation: typeof executeIdempotentMutation;
  claimPortalRateLimit: typeof claimPortalRateLimit;
};

export type PortalMcpToolContext = PortalMcpDependencies & {
  actor: PortalActor;
};

const defaultDependencies: PortalMcpDependencies = {
  listPortalTemplateSummaries,
  listAccessibleAppSummaries,
  createGeneratedApp,
  getAccessibleAppSummary,
  getAccessiblePublishAttemptSummary,
  grantRepositoryAccessForActor,
  queuePublishForActor,
  repairPublishingSetupForActor,
  retryPublishForActor,
  getActiveTemplateBySlug,
  executeIdempotentMutation,
  claimPortalRateLimit,
};

export function registerPortalTools(
  server: PortalMcpServer,
  context: PortalMcpToolContext,
) {
  registerListAppTemplatesTool(server, context);
  registerListMyAppsTool(server, context);
  registerCreateAppTool(server, context);
  registerGetAppTool(server, context);
  registerRequestGitHubAccessTool(server, context);
  registerPublishAppToAzureTool(server, context);
  registerGetPublishStatusTool(server, context);
  registerRepairPublishingSetupTool(server, context);
  registerRetryPublishTool(server, context);
}

export function createPortalMcpHandler(
  actor: PortalActor,
  dependencies: Partial<PortalMcpDependencies> = {},
) {
  const context: PortalMcpToolContext = {
    actor,
    ...defaultDependencies,
    ...dependencies,
  };

  return createMcpHandler(
    (server) => registerPortalTools(server, context),
    {
      serverInfo: { name: "cedarville-app-portal", version: "1.0.0" },
      instructions:
        "List current templates before app creation. Creation never publishes. Publish, repair, and retry require a separate explicit user request.",
    },
  );
}
