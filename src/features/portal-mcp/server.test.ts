import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalAppSummary } from "@/features/app-requests/portal-summary";
import { PortalApiError } from "@/features/portal-api/errors";
import type { PortalActor } from "@/features/portal-api/principal";
import { getActiveTemplateBySlug } from "@/features/templates/catalog";
import { createAppToolInputSchema } from "./tools/create-app";
import { getAppToolInputSchema } from "./tools/get-app";
import { getPublishStatusToolInputSchema } from "./tools/get-publish-status";
import { listAppTemplatesToolInputSchema } from "./tools/list-app-templates";
import { listMyAppsToolInputSchema } from "./tools/list-my-apps";
import { publishAppToAzureToolInputSchema } from "./tools/publish-app-to-azure";
import { repairPublishingSetupToolInputSchema } from "./tools/repair-publishing-setup";
import { requestGitHubAccessToolInputSchema } from "./tools/request-github-access";
import { retryPublishToolInputSchema } from "./tools/retry-publish";
import {
  createPortalMcpHandler,
  registerPortalTools,
  type PortalMcpDependencies,
  type PortalMcpServer,
} from "./server";

const actor: PortalActor = {
  userId: "user-1",
  entraOid: "entra-1",
  email: "employee@cedarville.edu",
  displayName: "Portal User",
  isAdmin: false,
};

const managedApp: PortalAppSummary = {
  id: "app-1",
  appName: "Example app",
  template: { slug: "web-app", name: "Custom Web App" },
  sourceOfTruth: "PORTAL_MANAGED_REPO",
  generationStatus: "SUCCEEDED",
  repositoryStatus: "READY",
  publishingSetupStatus: "READY",
  publishStatus: "NOT_STARTED",
  repositoryAccess: { status: "NOT_REQUESTED", note: null },
  repository: {
    url: "https://github.com/cedarville/app-1",
    defaultBranch: "main",
  },
  supportReference: "SUPPORT-1",
  latestAttempt: null,
  liveUrl: null,
  allowedNextActions: [
    "request_github_access",
    "publish_app_to_azure",
    "open_portal_for_advanced_management",
  ],
};

type RegisteredTool = {
  config: {
    annotations?: Record<string, boolean>;
    inputSchema?: { safeParse(value: unknown): { success: boolean } };
  };
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

function fakeServer() {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool(
      name: string,
      config: RegisteredTool["config"],
      handler: RegisteredTool["handler"],
    ) {
      tools.set(name, { config, handler });
      return {};
    },
  } as unknown as PortalMcpServer;

  return { server, tools };
}

function dependencies(): PortalMcpDependencies {
  return {
    listPortalTemplateSummaries: vi.fn(() => [
      {
        slug: "web-app",
        name: "Custom Web App",
        description: "A full-stack starter.",
        decisionSummary: "Use this for a custom app.",
        bestFor: ["Forms"],
        category: "developer",
        hostingTarget: "Azure App Service",
        database: { mode: "optional", options: ["postgresql", "none"] },
        audience: { cedarville: true, public: true },
      },
    ]),
    listAccessibleAppSummaries: vi.fn(async () => [managedApp]),
    createGeneratedApp: vi.fn(async () => ({
      requestId: "app-1",
      supportReference: "SUPPORT-1",
      generationStatus: "SUCCEEDED" as const,
      repositoryStatus: "READY" as const,
      repositoryUrl: "https://github.com/cedarville/app-1",
    })),
    getAccessibleAppSummary: vi.fn(async () => managedApp),
    getAccessiblePublishAttemptSummary: vi.fn(async () => ({
      id: "attempt-1",
      appId: "app-1",
      status: "RUNNING" as const,
      stage: "DEPLOYING" as const,
      workflowUrl: "https://github.com/cedarville/app-1/actions/runs/1",
      startedAt: new Date("2026-09-01T12:00:00.000Z"),
      finishedAt: null,
    })),
    grantRepositoryAccessForActor: vi.fn(async () => ({
      status: "GRANTED" as const,
      note: "GitHub access is ready.",
      githubUsername: "portal-user",
    })),
    queuePublishForActor: vi.fn(async () => ({
      attemptId: "attempt-1",
      status: "QUEUED" as const,
    })),
    repairPublishingSetupForActor: vi.fn(async () => ({
      status: "READY" as const,
    })),
    retryPublishForActor: vi.fn(async () => ({
      attemptId: "attempt-2",
      status: "QUEUED" as const,
    })),
    getActiveTemplateBySlug: vi.fn(getActiveTemplateBySlug),
    executeIdempotentMutation: vi.fn(async (options) => {
      await options.claimRateLimit();
      return options.execute();
    }) as PortalMcpDependencies["executeIdempotentMutation"],
    claimPortalRateLimit: vi.fn(async () => undefined),
  };
}

function registeredPortalTools(overrides: Partial<PortalMcpDependencies> = {}) {
  const deps = { ...dependencies(), ...overrides };
  const { server, tools } = fakeServer();
  registerPortalTools(server, { actor, ...deps });
  return { deps, tools };
}

function tool(
  tools: Map<string, RegisteredTool>,
  name: string,
): RegisteredTool {
  const registered = tools.get(name);
  if (!registered) throw new Error(`Tool ${name} was not registered.`);
  return registered;
}

function modernRequest(method: string, params: Record<string, unknown>) {
  return new Request("https://portal.example.edu/api/mcp", {
    method: "POST",
    headers: {
      Authorization: "Bearer signed-token",
      Accept: "application/json",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
      ...(method === "tools/call"
        ? { "Mcp-Name": String(params.name) }
        : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
}

describe("portal MCP server contract", () => {
  it("registers exactly the nine approved tools in workflow order", () => {
    const { tools } = registeredPortalTools();

    expect([...tools.keys()]).toEqual([
      "list_app_templates",
      "list_my_apps",
      "create_app",
      "get_app",
      "request_github_access",
      "publish_app_to_azure",
      "get_publish_status",
      "repair_publishing_setup",
      "retry_publish",
    ]);
    expect(tools.has("delete_app")).toBe(false);
  });

  it("marks reads closed-world and mutations non-destructive open-world", () => {
    const { tools } = registeredPortalTools();
    const readNames = [
      "list_app_templates",
      "list_my_apps",
      "get_app",
      "get_publish_status",
    ];
    const mutationNames = [
      "create_app",
      "request_github_access",
      "publish_app_to_azure",
      "repair_publishing_setup",
      "retry_publish",
    ];

    for (const name of readNames) {
      expect(tool(tools, name).config.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
    }
    for (const name of mutationNames) {
      expect(tool(tools, name).config.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      });
    }
  });

  it("uses strict schemas and UUID idempotency keys", () => {
    const idempotencyKey = "53b6240b-2f6f-4ab8-bf70-3458b861bf3f";

    expect(listAppTemplatesToolInputSchema.safeParse({}).success).toBe(true);
    expect(listAppTemplatesToolInputSchema.safeParse({ extra: true }).success).toBe(false);
    expect(listMyAppsToolInputSchema.safeParse({}).success).toBe(true);
    expect(getAppToolInputSchema.safeParse({ appId: "app-1" }).success).toBe(true);
    expect(getPublishStatusToolInputSchema.safeParse({ attemptId: "attempt-1" }).success).toBe(true);
    expect(
      createAppToolInputSchema.safeParse({
        idempotencyKey,
        templateSlug: "web-app",
        appName: "Example app",
        description: "Example description",
        databaseProvider: "postgresql",
        entraLogin: true,
      }).success,
    ).toBe(true);
    expect(
      requestGitHubAccessToolInputSchema.safeParse({
        idempotencyKey,
        appId: "app-1",
        githubUsername: "portal-user",
      }).success,
    ).toBe(true);
    for (const schema of [
      publishAppToAzureToolInputSchema,
      repairPublishingSetupToolInputSchema,
      retryPublishToolInputSchema,
    ]) {
      expect(schema.safeParse({ idempotencyKey, appId: "app-1" }).success).toBe(true);
      expect(schema.safeParse({ idempotencyKey: "not-a-uuid", appId: "app-1" }).success).toBe(false);
      expect(schema.safeParse({ idempotencyKey, appId: "app-1", extra: true }).success).toBe(false);
      expect(
        schema.safeParse({ idempotencyKey, appId: "a".repeat(129) }).success,
      ).toBe(false);
    }

    expect(createAppToolInputSchema.safeParse({
      idempotencyKey,
      templateSlug: "t".repeat(101),
      appName: "Example app",
      description: "Example description",
      databaseProvider: "none",
      entraLogin: true,
    }).success).toBe(false);
    expect(createAppToolInputSchema.safeParse({
      idempotencyKey,
      templateSlug: "web-app",
      appName: "a".repeat(101),
      description: "Example description",
      databaseProvider: "none",
      entraLogin: true,
    }).success).toBe(false);
    expect(createAppToolInputSchema.safeParse({
      idempotencyKey,
      templateSlug: "web-app",
      appName: "Example app",
      description: "d".repeat(2001),
      databaseProvider: "none",
      entraLogin: true,
    }).success).toBe(false);
    expect(
      getAppToolInputSchema.safeParse({ appId: "a".repeat(129) }).success,
    ).toBe(false);
    expect(
      getPublishStatusToolInputSchema.safeParse({
        attemptId: "a".repeat(129),
      }).success,
    ).toBe(false);
    expect(
      requestGitHubAccessToolInputSchema.safeParse({
        idempotencyKey,
        appId: "app-1",
        githubUsername: "g".repeat(40),
      }).success,
    ).toBe(false);
    expect(
      requestGitHubAccessToolInputSchema.safeParse({
        idempotencyKey,
        appId: "a".repeat(129),
        githubUsername: "portal-user",
      }).success,
    ).toBe(false);
  });

  it.each([
    {
      name: "create_app",
      arguments: {
        idempotencyKey: "53b6240b-2f6f-4ab8-bf70-3458b861bf3f",
        templateSlug: "t".repeat(101),
        appName: "Example app",
        description: "Example description",
        databaseProvider: "none",
        entraLogin: true,
      },
    },
    {
      name: "create_app",
      arguments: {
        idempotencyKey: "53b6240b-2f6f-4ab8-bf70-3458b861bf3f",
        templateSlug: "web-app",
        appName: "a".repeat(101),
        description: "Example description",
        databaseProvider: "none",
        entraLogin: true,
      },
    },
    {
      name: "create_app",
      arguments: {
        idempotencyKey: "53b6240b-2f6f-4ab8-bf70-3458b861bf3f",
        templateSlug: "web-app",
        appName: "Example app",
        description: "d".repeat(2001),
        databaseProvider: "none",
        entraLogin: true,
      },
    },
    { name: "get_app", arguments: { appId: "a".repeat(129) } },
    {
      name: "get_publish_status",
      arguments: { attemptId: "a".repeat(129) },
    },
    {
      name: "request_github_access",
      arguments: {
        idempotencyKey: "53b6240b-2f6f-4ab8-bf70-3458b861bf3f",
        appId: "app-1",
        githubUsername: "g".repeat(40),
      },
    },
  ])(
    "rejects oversized $name input in the installed runtime before adapter side effects",
    async ({ name, arguments: toolArguments }) => {
      const deps = dependencies();
      const handler = createPortalMcpHandler(actor, deps);

      const response = await handler(
        modernRequest("tools/call", { name, arguments: toolArguments }),
      );
      const frame = (await response.json()) as {
        result?: {
          isError?: boolean;
          content?: Array<{ type?: string; text?: string }>;
        };
      };

      expect(response.status).toBe(200);
      expect(frame.result?.isError).toBe(true);
      expect(frame.result?.content?.[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("Input validation error"),
      });
      expect(deps.getActiveTemplateBySlug).not.toHaveBeenCalled();
      expect(deps.getAccessibleAppSummary).not.toHaveBeenCalled();
      expect(deps.getAccessiblePublishAttemptSummary).not.toHaveBeenCalled();
      expect(deps.executeIdempotentMutation).not.toHaveBeenCalled();
      expect(deps.claimPortalRateLimit).not.toHaveBeenCalled();
    },
  );
});

describe("portal MCP read adapters", () => {
  it("rate limits and returns active templates, accessible apps, and app details", async () => {
    const { deps, tools } = registeredPortalTools();

    await tool(tools, "list_app_templates").handler({});
    await tool(tools, "list_my_apps").handler({});
    const appResult = await tool(tools, "get_app").handler({ appId: "app-1" });

    expect(deps.claimPortalRateLimit).toHaveBeenCalledTimes(3);
    expect(deps.claimPortalRateLimit).toHaveBeenNthCalledWith(1, "user-1", "read");
    expect(deps.claimPortalRateLimit).toHaveBeenNthCalledWith(2, "user-1", "read");
    expect(deps.claimPortalRateLimit).toHaveBeenNthCalledWith(3, "user-1", "read");
    expect(deps.listPortalTemplateSummaries).toHaveBeenCalledOnce();
    expect(deps.listAccessibleAppSummaries).toHaveBeenCalledWith(actor);
    expect(deps.getAccessibleAppSummary).toHaveBeenCalledWith(actor, "app-1");
    expect(appResult).toMatchObject({ structuredContent: { app: managedApp } });
  });

  it("returns authorized publish status with safe app context", async () => {
    const { deps, tools } = registeredPortalTools();

    const result = await tool(tools, "get_publish_status").handler({
      attemptId: "attempt-1",
    });

    expect(deps.claimPortalRateLimit).toHaveBeenCalledWith("user-1", "read");
    expect(deps.getAccessiblePublishAttemptSummary).toHaveBeenCalledWith(
      actor,
      "attempt-1",
    );
    expect(deps.getAccessibleAppSummary).toHaveBeenCalledWith(actor, "app-1");
    expect(result).toMatchObject({
      structuredContent: {
        id: "attempt-1",
        appId: "app-1",
        status: "RUNNING",
        stage: "DEPLOYING",
        supportReference: "SUPPORT-1",
        liveUrl: null,
        allowedNextActions: managedApp.allowedNextActions,
      },
    });
  });

  it("returns the same quiet failure shape for an inaccessible app", async () => {
    const getAccessibleAppSummary = vi.fn(async () => {
      throw new PortalApiError("NOT_FOUND", "App not found.");
    });
    const { tools } = registeredPortalTools({ getAccessibleAppSummary });

    await expect(tool(tools, "get_app").handler({ appId: "foreign-app" })).resolves.toEqual({
      isError: true,
      content: [{ type: "text", text: "App not found." }],
      structuredContent: {
        code: "NOT_FOUND",
        message: "App not found.",
        retryAfterSeconds: null,
      },
    });
  });
});

describe("portal MCP mutation adapters", () => {
  const idempotencyKey = "53b6240b-2f6f-4ab8-bf70-3458b861bf3f";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates from the selected template target and never publishes", async () => {
    const { deps, tools } = registeredPortalTools();

    const result = await tool(tools, "create_app").handler({
      idempotencyKey,
      templateSlug: "web-app",
      appName: "Example app",
      description: "An example app",
      databaseProvider: "postgresql",
      entraLogin: true,
    });

    expect(deps.executeIdempotentMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        operation: "create_app",
        idempotencyKey,
        expiresInSeconds: 604800,
        input: {
          templateSlug: "web-app",
          appName: "Example app",
          description: "An example app",
          databaseProvider: "postgresql",
          entraLogin: true,
        },
      }),
    );
    expect(deps.claimPortalRateLimit).toHaveBeenCalledWith("user-1", "create_app");
    expect(deps.createGeneratedApp).toHaveBeenCalledWith({
      actorUserId: "user-1",
      source: "codex-mcp",
      input: {
        templateSlug: "web-app",
        appName: "Example app",
        description: "An example app",
        hostingTarget: "Azure App Service",
        databaseProvider: "postgresql",
        entraLogin: true,
      },
    });
    expect(deps.queuePublishForActor).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      structuredContent: {
        requestId: "app-1",
        allowedNextActions: managedApp.allowedNextActions,
      },
    });
  });

  it("rejects create choices that the selected template does not support", async () => {
    const { deps, tools } = registeredPortalTools();

    const result = await tool(tools, "create_app").handler({
      idempotencyKey,
      templateSlug: "public-information-page",
      appName: "Public page",
      description: "Public information",
      databaseProvider: "postgresql",
      entraLogin: false,
      publicAcknowledgement: true,
    });

    expect(result).toMatchObject({
      isError: true,
      structuredContent: { code: "INVALID_INPUT" },
    });
    expect(deps.executeIdempotentMutation).not.toHaveBeenCalled();
    expect(deps.createGeneratedApp).not.toHaveBeenCalled();
  });

  it.each([
    {
      toolName: "request_github_access",
      action: "request_github_access",
      input: { appId: "app-1", githubUsername: "portal-user" },
      service: "grantRepositoryAccessForActor" as const,
      serviceInput: {
        requestId: "app-1",
        actorUserId: "user-1",
        githubUsername: "portal-user",
        source: "codex-mcp",
      },
    },
    {
      toolName: "publish_app_to_azure",
      action: "publish_app_to_azure",
      input: { appId: "app-1" },
      service: "queuePublishForActor" as const,
      serviceInput: {
        requestId: "app-1",
        actorUserId: "user-1",
        source: "codex-mcp",
      },
    },
    {
      toolName: "repair_publishing_setup",
      action: "repair_publishing_setup",
      input: { appId: "app-1" },
      service: "repairPublishingSetupForActor" as const,
      serviceInput: {
        requestId: "app-1",
        actorUserId: "user-1",
        source: "codex-mcp",
      },
    },
    {
      toolName: "retry_publish",
      action: "retry_publish",
      input: { appId: "app-1" },
      service: "retryPublishForActor" as const,
      serviceInput: {
        requestId: "app-1",
        actorUserId: "user-1",
        source: "codex-mcp",
      },
    },
  ])(
    "scopes, rate limits, and idempotently executes $toolName",
    async ({ toolName, action, input, service, serviceInput }) => {
      const { deps, tools } = registeredPortalTools();

      const result = await tool(tools, toolName).handler({
        idempotencyKey,
        ...input,
      });

      expect(deps.getAccessibleAppSummary).toHaveBeenCalledWith(actor, "app-1");
      expect(deps.executeIdempotentMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: "user-1",
          operation: action,
          idempotencyKey,
          expiresInSeconds: 604800,
          input,
        }),
      );
      expect(deps.claimPortalRateLimit).toHaveBeenCalledWith("user-1", action);
      expect(deps[service]).toHaveBeenCalledWith(serviceInput);
      expect(result).toMatchObject({ structuredContent: expect.any(Object) });
    },
  );

  it.each([
    "request_github_access",
    "publish_app_to_azure",
    "repair_publishing_setup",
    "retry_publish",
  ])("keeps imported and local app workflows out of %s", async (toolName) => {
    const importedApp = {
      ...managedApp,
      sourceOfTruth: "IMPORTED_REPOSITORY" as const,
    };
    const getAccessibleAppSummary = vi.fn(async () => importedApp);
    const { deps, tools } = registeredPortalTools({ getAccessibleAppSummary });
    const input = {
      idempotencyKey,
      appId: "app-1",
      ...(toolName === "request_github_access"
        ? { githubUsername: "portal-user" }
        : {}),
    };

    const result = await tool(tools, toolName).handler(input);

    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "Open the Cedarville App Portal for this app workflow.",
        },
      ],
      structuredContent: {
        code: "ACTION_REQUIRED",
        message: "Open the Cedarville App Portal for this app workflow.",
        retryAfterSeconds: null,
      },
    });
    expect(deps.executeIdempotentMutation).not.toHaveBeenCalled();
    expect(deps.grantRepositoryAccessForActor).not.toHaveBeenCalled();
    expect(deps.queuePublishForActor).not.toHaveBeenCalled();
    expect(deps.repairPublishingSetupForActor).not.toHaveBeenCalled();
    expect(deps.retryPublishForActor).not.toHaveBeenCalled();
  });
});
