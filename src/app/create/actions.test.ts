import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { buildArchive } from "@/features/generation/build-archive";
import { deleteArtifact, saveArtifact } from "@/features/generation/storage";
import { grantManagedRepositoryAccess } from "@/features/repositories/access";
import { bootstrapManagedRepository } from "@/features/repositories/bootstrap-managed-repository";
import { publishToAzureAction } from "@/features/publishing/actions";
import type { PortalTemplate } from "@/features/templates/types";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { createAppAction, extractCreateAppInput } from "./actions";

const mockRedirect = vi.hoisted(() => vi.fn());
const catalogMock = vi.hoisted(() => ({
  activeTemplateOverrides: new Map<string, PortalTemplate>(),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/features/generation/build-archive", () => ({
  buildArchive: vi.fn(),
}));

vi.mock("@/features/generation/storage", () => ({
  deleteArtifact: vi.fn(),
  saveArtifact: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));

vi.mock("@/features/repositories/bootstrap-managed-repository", () => ({
  bootstrapManagedRepository: vi.fn(),
}));

vi.mock("@/features/repositories/access", () => ({
  grantManagedRepositoryAccess: vi.fn(),
}));

vi.mock("@/features/publishing/actions", () => ({
  publishToAzureAction: vi.fn(),
}));

vi.mock("@/features/templates/catalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/templates/catalog")>();

  return {
    ...actual,
    getActiveTemplateBySlug: vi.fn((slug: string) => {
      return (
        catalogMock.activeTemplateOverrides.get(slug) ??
        actual.getActiveTemplateBySlug(slug)
      );
    }),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    template: {
      upsert: vi.fn(),
    },
    appRequest: {
      create: vi.fn(),
      update: vi.fn(),
    },
    generatedArtifact: {
      create: vi.fn(),
    },
  },
}));

const noDatabaseTemplate = {
  id: "no-database-v1",
  slug: "no-database",
  name: "No Database Template",
  description: "A template without database support.",
  decisionSummary: "Use this when no database is needed.",
  bestFor: ["Static content"],
  hostingTarget: "Azure App Service",
  appServiceRuntime: {
    family: "node",
    framework: "nextjs",
    displayName: "Node.js 24 / Next.js",
    azureRuntimeStack: "NODE|24-lts",
    startupCommand: "npm start",
    workflowFileName: "deploy-azure-app-service.yml",
  },
  features: {
    database: {
      mode: "unsupported",
      providerOptions: [],
      defaultProvider: "none",
    },
    entraLogin: {
      mode: "optional",
      defaultEnabled: true,
    },
  },
  version: "1.0.0",
  status: "ACTIVE",
  fields: [
    { name: "appName", label: "App Name", type: "text", required: true },
    {
      name: "description",
      label: "Short Description",
      type: "textarea",
      required: true,
    },
    {
      name: "hostingTarget",
      label: "Hosting Target",
      type: "select",
      required: true,
      options: ["Azure App Service"],
    },
  ],
} satisfies PortalTemplate;

describe("extractCreateAppInput", () => {
  beforeEach(() => {
    catalogMock.activeTemplateOverrides.clear();
    mockRedirect.mockReset();
    vi.mocked(buildArchive).mockReset();
    vi.mocked(deleteArtifact).mockReset();
    vi.mocked(saveArtifact).mockReset();
    vi.mocked(grantManagedRepositoryAccess).mockReset();
    vi.mocked(bootstrapManagedRepository).mockReset();
    vi.mocked(publishToAzureAction).mockReset();
    vi.mocked(recordAuditEvent).mockReset();
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(prisma.template.upsert).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.appRequest.create).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(prisma.generatedArtifact.create).mockReset();
  });

  it("builds the validated payload from form data", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Azure App Service");

    const input = await extractCreateAppInput(formData);

    expect(input.appName).toBe("Campus Dashboard");
    expect(input.templateSlug).toBe("web-app");
    expect(input.databaseProvider).toBe("postgresql");
    expect(input.entraLogin).toBe(true);
  });

  it("rejects unknown templates", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "missing-template");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Azure App Service");

    await expect(extractCreateAppInput(formData)).rejects.toThrow(
      "Invalid template selection.",
    );
  });

  it("rejects PostgreSQL for a template that does not support a database", async () => {
    catalogMock.activeTemplateOverrides.set(
      noDatabaseTemplate.slug,
      noDatabaseTemplate,
    );
    const formData = new FormData();
    formData.set("templateSlug", "no-database");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Azure App Service");
    formData.set("databaseProvider", "postgresql");

    await expect(extractCreateAppInput(formData)).rejects.toThrow(
      "This template does not support a database.",
    );
  });
});

describe("createAppAction", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    catalogMock.activeTemplateOverrides.clear();
    mockRedirect.mockReset();
    vi.mocked(buildArchive).mockReset();
    vi.mocked(deleteArtifact).mockReset();
    vi.mocked(saveArtifact).mockReset();
    vi.mocked(grantManagedRepositoryAccess).mockReset();
    vi.mocked(bootstrapManagedRepository).mockReset();
    vi.mocked(publishToAzureAction).mockReset();
    vi.mocked(recordAuditEvent).mockReset();
    vi.mocked(resolveCurrentUserId).mockReset();
    vi.mocked(prisma.template.upsert).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.appRequest.create).mockReset();
    vi.mocked(prisma.appRequest.update).mockReset();
    vi.mocked(prisma.generatedArtifact.create).mockReset();
    consoleErrorSpy.mockClear();
  });

  it("generates an archive, stores it, and redirects to the download page", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Azure App Service");

    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-db-123",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "request-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(buildArchive).mockResolvedValue({
      buffer: Buffer.from("zip"),
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      filename: "campus-dashboard.zip",
    });
    vi.mocked(saveArtifact).mockResolvedValue(
      "/tmp/.artifacts/campus-dashboard.zip",
    );
    vi.mocked(prisma.generatedArtifact.create).mockResolvedValue({
      id: "artifact-123",
    } as Awaited<ReturnType<typeof prisma.generatedArtifact.create>>);
    vi.mocked(bootstrapManagedRepository).mockResolvedValue({
      provider: "GITHUB",
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
      visibility: "private",
    });

    await createAppAction(formData);

    expect(buildArchive).toHaveBeenCalledWith({
      templateSlug: "web-app",
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: true,
    });
    expect(saveArtifact).toHaveBeenCalledWith(
      "campus-dashboard.zip",
      Buffer.from("zip"),
    );
    expect(prisma.template.upsert).toHaveBeenCalled();
    expect(prisma.appRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          submittedConfig: expect.objectContaining({
            databaseProvider: "postgresql",
            entraLogin: true,
          }),
        }),
      }),
    );
    expect(prisma.generatedArtifact.create).toHaveBeenCalled();
    expect(bootstrapManagedRepository).toHaveBeenCalledWith({
      appRequestId: "request-123",
      input: {
        templateSlug: "web-app",
        appName: "Campus Dashboard",
        description: "Shows campus metrics.",
        hostingTarget: "Azure App Service",
        databaseProvider: "postgresql",
        entraLogin: true,
      },
      files: {
        "README.md": "# Campus Dashboard\n",
      },
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: {
        repositoryProvider: "GITHUB",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryDefaultBranch: "main",
        repositoryVisibility: "private",
        repositoryStatus: "READY",
        repositoryAccessStatus: "NOT_REQUESTED",
        repositoryAccessNote: null,
      },
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: { generationStatus: "SUCCEEDED" },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "APP_REQUEST_SUCCEEDED",
      expect.objectContaining({ requestId: "request-123" }),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/download/request-123");
  });

  it("queues publishing after generated repository bootstrap when requested", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Azure App Service");
    formData.set("createIntent", "createAndPublish");

    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-db-123",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "request-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(buildArchive).mockResolvedValue({
      buffer: Buffer.from("zip"),
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      filename: "campus-dashboard.zip",
    });
    vi.mocked(saveArtifact).mockResolvedValue(
      "/tmp/.artifacts/campus-dashboard.zip",
    );
    vi.mocked(prisma.generatedArtifact.create).mockResolvedValue({
      id: "artifact-123",
    } as Awaited<ReturnType<typeof prisma.generatedArtifact.create>>);
    vi.mocked(bootstrapManagedRepository).mockResolvedValue({
      provider: "GITHUB",
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
      visibility: "private",
    });

    await createAppAction(formData);

    expect(publishToAzureAction).toHaveBeenCalledWith("request-123");
    expect(mockRedirect).toHaveBeenCalledWith("/download/request-123");
  });

  it("skips one-step publishing when repository bootstrap fails", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Azure App Service");
    formData.set("createIntent", "createAndPublish");

    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-db-123",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "request-789",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(buildArchive).mockResolvedValue({
      buffer: Buffer.from("zip"),
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      filename: "campus-dashboard.zip",
    });
    vi.mocked(saveArtifact).mockResolvedValue(
      "/tmp/.artifacts/campus-dashboard.zip",
    );
    vi.mocked(prisma.generatedArtifact.create).mockResolvedValue({
      id: "artifact-123",
    } as Awaited<ReturnType<typeof prisma.generatedArtifact.create>>);
    vi.mocked(bootstrapManagedRepository).mockRejectedValue(
      new Error("missing GitHub app config"),
    );

    await createAppAction(formData);

    expect(publishToAzureAction).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/download/request-789");
  });

  it("does not mark generation failed when Next redirects after success", async () => {
    const redirectError = new Error("NEXT_REDIRECT");
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Azure App Service");

    mockRedirect.mockImplementation(() => {
      throw redirectError;
    });
    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-db-123",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "request-123",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(buildArchive).mockResolvedValue({
      buffer: Buffer.from("zip"),
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      filename: "campus-dashboard.zip",
    });
    vi.mocked(saveArtifact).mockResolvedValue(
      "/tmp/.artifacts/campus-dashboard.zip",
    );
    vi.mocked(prisma.generatedArtifact.create).mockResolvedValue({
      id: "artifact-123",
    } as Awaited<ReturnType<typeof prisma.generatedArtifact.create>>);
    vi.mocked(bootstrapManagedRepository).mockResolvedValue({
      provider: "GITHUB",
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
      visibility: "private",
    });

    await expect(createAppAction(formData)).rejects.toThrow(redirectError);

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: { generationStatus: "SUCCEEDED" },
    });
    expect(prisma.appRequest.update).not.toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: { generationStatus: "FAILED" },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "APP_REQUEST_SUCCEEDED",
      expect.objectContaining({ requestId: "request-123" }),
    );
    expect(recordAuditEvent).not.toHaveBeenCalledWith(
      "APP_REQUEST_FAILED",
      expect.anything(),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/download/request-123");
  });

  it("marks the request failed when archive generation throws", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Azure App Service");

    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-db-123",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "request-456",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(buildArchive).mockRejectedValue(new Error("zip failed"));

    await expect(createAppAction(formData)).rejects.toThrow("zip failed");

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-456" },
      data: { generationStatus: "FAILED" },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "APP_REQUEST_FAILED",
      expect.objectContaining({
        requestId: "request-456",
        error: "zip failed",
      }),
    );
  });

  it("deletes a saved artifact when persistence fails after storage succeeds", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Azure App Service");

    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-db-123",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "request-999",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(buildArchive).mockResolvedValue({
      buffer: Buffer.from("zip"),
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      filename: "campus-dashboard.zip",
    });
    vi.mocked(saveArtifact).mockResolvedValue(
      "/tmp/.artifacts/campus-dashboard.zip",
    );
    vi.mocked(prisma.generatedArtifact.create).mockRejectedValue(
      new Error("db failed"),
    );

    await expect(createAppAction(formData)).rejects.toThrow("db failed");

    expect(deleteArtifact).toHaveBeenCalledWith(
      "/tmp/.artifacts/campus-dashboard.zip",
    );
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-999" },
      data: { generationStatus: "FAILED" },
    });
  });

  it("marks repo setup failed without failing artifact generation", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Azure App Service");

    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-db-123",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "request-789",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(buildArchive).mockResolvedValue({
      buffer: Buffer.from("zip"),
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      filename: "campus-dashboard.zip",
    });
    vi.mocked(saveArtifact).mockResolvedValue(
      "/tmp/.artifacts/campus-dashboard.zip",
    );
    vi.mocked(prisma.generatedArtifact.create).mockResolvedValue({
      id: "artifact-123",
    } as Awaited<ReturnType<typeof prisma.generatedArtifact.create>>);
    vi.mocked(bootstrapManagedRepository).mockRejectedValue(
      new Error("missing GitHub app config"),
    );

    await createAppAction(formData);

    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-789" },
      data: {
        repositoryStatus: "FAILED",
        publishErrorSummary: "missing GitHub app config",
      },
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Managed repository bootstrap failed",
      expect.objectContaining({
        requestId: "request-789",
        supportReference: expect.any(String),
        error: expect.any(Error),
      }),
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "REPOSITORY_BOOTSTRAP_FAILED",
      expect.objectContaining({
        requestId: "request-789",
        error: "missing GitHub app config",
      }),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/download/request-789");
  });

  it("grants repo access automatically when the user already has a GitHub username", async () => {
    const formData = new FormData();
    formData.set("templateSlug", "web-app");
    formData.set("appName", "Campus Dashboard");
    formData.set("description", "Shows campus metrics.");
    formData.set("hostingTarget", "Azure App Service");

    vi.mocked(resolveCurrentUserId).mockResolvedValue("user-123");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.template.upsert).mockResolvedValue({
      id: "template-db-123",
    } as Awaited<ReturnType<typeof prisma.template.upsert>>);
    vi.mocked(prisma.appRequest.create).mockResolvedValue({
      id: "request-321",
    } as Awaited<ReturnType<typeof prisma.appRequest.create>>);
    vi.mocked(buildArchive).mockResolvedValue({
      buffer: Buffer.from("zip"),
      files: {
        "README.md": "# Campus Dashboard\n",
      },
      filename: "campus-dashboard.zip",
    });
    vi.mocked(saveArtifact).mockResolvedValue(
      "/tmp/.artifacts/campus-dashboard.zip",
    );
    vi.mocked(prisma.generatedArtifact.create).mockResolvedValue({
      id: "artifact-123",
    } as Awaited<ReturnType<typeof prisma.generatedArtifact.create>>);
    vi.mocked(bootstrapManagedRepository).mockResolvedValue({
      provider: "GITHUB",
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
      visibility: "private",
    });
    vi.mocked(grantManagedRepositoryAccess).mockResolvedValue({
      status: "INVITED",
      invitationId: 42,
    });

    await createAppAction(formData);

    expect(grantManagedRepositoryAccess).toHaveBeenCalledWith({
      owner: "cedarville-it",
      repositoryName: "campus-dashboard",
      githubUsername: "portalstaff",
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-321" },
      data: {
        repositoryAccessStatus: "INVITED",
        repositoryAccessNote:
          "GitHub invited @portalstaff to this repository.",
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "REPOSITORY_ACCESS_SUCCEEDED",
      expect.objectContaining({
        requestId: "request-321",
        githubUsername: "portalstaff",
        accessStatus: "INVITED",
      }),
    );
  });
});
