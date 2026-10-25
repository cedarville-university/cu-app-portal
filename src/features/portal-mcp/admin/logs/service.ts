import { createHash } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { prisma } from "@/lib/db";
import type { PortalActor } from "@/features/portal-api/principal";
import { PortalApiError } from "@/features/portal-api/errors";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { assertPortalAdmin } from "../guard";
import { adminGetAppLogsSchema, parseAdminInput, type AdminGetAppLogsInput } from "../schemas";
import { LogReadBudget } from "./http";
import { readGitHubLogs } from "./github";
import { readAzureLogs } from "./azure";
import { LogReadError, sourceFailure, type LogEntry, type GitHubPosition, type AzurePosition, type ProviderLogPage } from "./types";
import { decodeLogCursor, encodeLogCursor } from "./cursor";
type GitHubTarget = Parameters<typeof readGitHubLogs>[0];
type AzureTarget = {
  resourceGroup: string;
  webApp: string;
};
type Selection = {
  maxLines: number;
  logKind: "deployment" | "runtime" | "both";
};
export type LogReadDependencies = {
  readGitHub(target: GitHubTarget, selection: Selection & {
    position?: GitHubPosition;
  }, budget: LogReadBudget): Promise<ProviderLogPage<GitHubPosition>>;
  readAzure(target: AzureTarget, selection: Selection & {
    position?: AzurePosition;
  }, budget: LogReadBudget): Promise<ProviderLogPage<AzurePosition>>;
};
const defaults: LogReadDependencies = {
  async readGitHub(target, selection, budget) {
    let config;
    try {
      config = loadGitHubAppConfig();
    }
    catch {
      throw new LogReadError("not_configured", "GitHub log access is not configured.");
    }
    const installationId = Object.entries(config.installationIdsByOrg).find(([org]) => org.toLowerCase() === target.owner.toLowerCase())?.[1];
    if (!config.allowedOrgs.some(org => org.toLowerCase() === target.owner.toLowerCase()) || !installationId)
      throw new LogReadError("forbidden", "This repository is outside the configured GitHub installation.");
    const client = createGitHubAppClient({
      appId: config.appId, privateKey: config.privateKey, installationId, fetchImpl: async (url, init) => {
        const response = await budget.request(String(url), init);
        return new Response(response.text || null, { status: response.status, headers: response.headers });
      }
    });
    // Reuse the server-only installation-token capability; never expose this token.
    let token: Promise<string> | undefined;
    return readGitHubLogs(target, selection, budget, () => token ??= client.createInstallationTokenForGit());
  },
  async readAzure(target, selection, budget) {
    const subscription = process.env.AZURE_PUBLISH_SUBSCRIPTION_ID;
    if (!subscription || !/^[a-f\d-]{36}$/i.test(subscription))
      throw new LogReadError("not_configured", "Azure log access requires a configured subscription.");
    const credential = new DefaultAzureCredential();
    let token: Promise<string> | undefined;
    return readAzureLogs({ ...target, subscription }, selection, budget, () => token ??= credential.getToken("https://management.azure.com/.default").then(value => {
      if (!value?.token)
        throw new LogReadError("forbidden", "The Azure identity could not obtain log access.");
      return value.token;
    }));
  },
};
export type AdminAppLogsResult = { appId: string; attemptId: string | null; collectedAt: string; sources: LogEntry[]; nextCursor: string | null };
export async function adminGetAppLogs(actor: PortalActor, input: AdminGetAppLogsInput, overrides: Partial<LogReadDependencies> = {}): Promise<AdminAppLogsResult> {
  assertPortalAdmin(actor);
  const args = parseAdminInput(adminGetAppLogsSchema, input);
  const cursor = args.cursor ? decodeLogCursor(args.cursor) : null;
  if (cursor && (cursor.appId !== args.appId || (args.attemptId && cursor.attemptId !== args.attemptId) || cursor.source !== args.source || cursor.logKind !== args.logKind || cursor.maxLines !== args.maxLines))
    throw new PortalApiError("INVALID_INPUT", "The log cursor does not match this request.");
  const attemptId = cursor ? cursor.attemptId : args.attemptId;
  const app = await prisma.appRequest.findUnique({ where: { id: args.appId }, select: {
      id: true, repositoryOwner: true, repositoryName: true, azureResourceGroup: true, azureWebAppName: true, publishAttempts: {
        where: attemptId ? { id: attemptId } : cursor ? { id: "__no_selected_attempt__" } : {}, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: {
          id: true, githubWorkflowRunId: true, status: true
        }
      }
    } });
  if (!app)
    throw new PortalApiError("NOT_FOUND", "App not found.");
  const attempt = app.publishAttempts[0] ?? null;
  if (attemptId && (!attempt || attempt.id !== attemptId))
    throw new PortalApiError("NOT_FOUND", "Publish attempt not found for this app.");
  const targetKey = createHash("sha256").update(JSON.stringify([
    app.repositoryOwner, app.repositoryName, app.azureResourceGroup, app.azureWebAppName, attempt?.githubWorkflowRunId ?? null
  ])).digest("hex");
  if (cursor && cursor.targetKey !== targetKey)
    throw new PortalApiError("INVALID_INPUT", "The app log target changed; request logs again without a cursor.");
  const deps = { ...defaults, ...overrides };
  const budget = new LogReadBudget();
  const sources: LogEntry[] = [];
  let githubNext: GitHubPosition | null = null;
  let azureNext: AzurePosition | null = null;
  try {
    if (args.source !== "azure" && (!cursor || cursor.github)) {
      try {
        if (!app.repositoryOwner || !app.repositoryName)
          throw new LogReadError("not_configured", "This app has no managed GitHub repository.");
        if (!attempt?.githubWorkflowRunId || !/^\d+$/.test(attempt.githubWorkflowRunId))
          throw new LogReadError("not_ready", "No workflow run ID is recorded for the selected publish attempt.");
        const page = await deps.readGitHub({
          owner: app.repositoryOwner, repo: app.repositoryName, runId: attempt.githubWorkflowRunId
        }, { ...args, position: cursor?.github ?? undefined }, budget);
        sources.push(...page.entries);
        githubNext = page.next;
      }
      catch (error) {
        sources.push(sourceFailure("github", error));
      }
    }
    if (args.source !== "github" && (!cursor || cursor.azure)) {
      try {
        if (!app.azureResourceGroup || !app.azureWebAppName)
          throw new LogReadError("not_configured", "This app has no recorded Azure Web App.");
        const page = await deps.readAzure({ resourceGroup: app.azureResourceGroup, webApp: app.azureWebAppName }, { ...args, position: cursor?.azure ?? undefined }, budget);
        sources.push(...page.entries);
        azureNext = page.next;
      }
      catch (error) {
        if (args.logKind !== "runtime")
          sources.push(sourceFailure("azure_deployment", error));
        if (args.logKind !== "deployment")
          sources.push(sourceFailure("azure_runtime", error));
      }
    }
    return {
      appId: app.id, attemptId: attempt?.id ?? null, collectedAt: new Date().toISOString(), sources, nextCursor: githubNext || azureNext ? encodeLogCursor({
        version: 1, appId: app.id, attemptId: attempt?.id ?? null, targetKey, source: args.source, logKind: args.logKind, maxLines: args.maxLines, github: githubNext, azure: azureNext
      }) : null
    };
  }
  finally {
    budget.close();
  }
}
