// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateAppRequestInput } from "./types";
import {
  createGeneratedApp,
  type CreateGeneratedAppDependencies,
} from "./create-generated-app";

const validInput: CreateAppRequestInput = {
  templateSlug: "public-information-page",
  appName: "Campus Dashboard",
  description: "Shows campus information.",
  hostingTarget: "Azure App Service",
  databaseProvider: "none",
  entraLogin: false,
};

const template = {
  slug: validInput.templateSlug,
  version: "1.0.0",
  hostingTarget: "Azure App Service",
  features: { database: { defaultProvider: "none" } },
};

function createDependencies(): CreateGeneratedAppDependencies {
  return {
    getActiveTemplateBySlug: vi.fn(() => template),
    serializeTemplateForStorage: vi.fn(() => ({ slug: template.slug })),
    prisma: {
      template: { upsert: vi.fn().mockResolvedValue({ id: "template-1" }) },
      appRequest: {
        create: vi.fn().mockResolvedValue({ id: "request-1" }),
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as CreateGeneratedAppDependencies["prisma"],
    createSupportReference: vi.fn(() => "SUP-20260901-ABC123"),
    buildSourceSnapshot: vi.fn().mockResolvedValue({ "README.md": "# Campus" }),
    getE2EManagedRepositoryBootstrap: vi.fn(() => null),
    bootstrapManagedRepository: vi.fn().mockResolvedValue({
      provider: "GITHUB",
      owner: "cedarville-it",
      name: "campus-dashboard-request-1",
      url: "https://github.com/cedarville-it/campus-dashboard-request-1",
      defaultBranch: "main",
      visibility: "private",
    }),
    recordAuditEvent: vi.fn().mockResolvedValue(undefined),
    safeNotifyAppEvent: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createGeneratedApp", () => {
  let dependencies: CreateGeneratedAppDependencies;

  beforeEach(() => {
    dependencies = createDependencies();
  });

  it("creates a managed repository for the explicit actor without publishing", async () => {
    const result = await createGeneratedApp(
      { actorUserId: "user-1", input: validInput, source: "codex-mcp" },
      dependencies,
    );

    expect(result).toEqual({
      requestId: "request-1",
      supportReference: "SUP-20260901-ABC123",
      generationStatus: "SUCCEEDED",
      repositoryStatus: "READY",
      repositoryUrl:
        "https://github.com/cedarville-it/campus-dashboard-request-1",
    });
    expect(dependencies.prisma.appRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          publishStatus: "NOT_STARTED",
        }),
      }),
    );
    expect(dependencies.recordAuditEvent).toHaveBeenCalledWith(
      "REPOSITORY_BOOTSTRAP_REQUESTED",
      expect.objectContaining({
        actorUserId: "user-1",
        source: "codex-mcp",
        requestId: "request-1",
        supportReference: "SUP-20260901-ABC123",
      }),
    );
    expect(dependencies.safeNotifyAppEvent).toHaveBeenCalledWith({
      appRequestId: "request-1",
      eventKey: "REPOSITORY_READY",
      actorUserId: "user-1",
      directRecipientUserIds: ["user-1"],
    });
  });

  it("records a safe repository failure after source generation succeeds", async () => {
    dependencies.bootstrapManagedRepository = vi
      .fn()
      .mockRejectedValue(new Error("GitHub provider detail"));

    const result = await createGeneratedApp(
      { actorUserId: "user-1", input: validInput, source: "portal-ui" },
      dependencies,
    );

    expect(result).toEqual({
      requestId: "request-1",
      supportReference: "SUP-20260901-ABC123",
      generationStatus: "SUCCEEDED",
      repositoryStatus: "FAILED",
      repositoryUrl: null,
    });
    expect(dependencies.prisma.appRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repositoryStatus: "FAILED",
          publishErrorSummary: expect.not.stringContaining("provider detail"),
        }),
      }),
    );
    expect(dependencies.safeNotifyAppEvent).toHaveBeenCalledWith({
      appRequestId: "request-1",
      eventKey: "REPOSITORY_FAILED",
      actorUserId: "user-1",
      directRecipientUserIds: ["user-1"],
    });
  });

  it("records a safe source-generation failure without bootstrapping a repository", async () => {
    dependencies.buildSourceSnapshot = vi
      .fn()
      .mockRejectedValue(new Error("template source: secret=provider-detail"));

    const result = await createGeneratedApp(
      { actorUserId: "user-1", input: validInput, source: "portal-ui" },
      dependencies,
    );

    expect(result).toEqual({
      requestId: "request-1",
      supportReference: "SUP-20260901-ABC123",
      generationStatus: "FAILED",
      repositoryStatus: "FAILED",
      repositoryUrl: null,
    });
    expect(dependencies.bootstrapManagedRepository).not.toHaveBeenCalled();
    expect(dependencies.prisma.appRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationStatus: "FAILED",
          repositoryStatus: "FAILED",
          publishErrorSummary: expect.not.stringContaining("provider-detail"),
        }),
      }),
    );
  });

  it("rejects when the selected template disappears before creation", async () => {
    dependencies.getActiveTemplateBySlug = vi.fn(() => undefined);

    await expect(
      createGeneratedApp(
        { actorUserId: "user-1", input: validInput, source: "portal-ui" },
        dependencies,
      ),
    ).rejects.toThrow("Template not found.");

    expect(dependencies.prisma.appRequest.create).not.toHaveBeenCalled();
  });
});
