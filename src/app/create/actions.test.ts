// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  resolveCurrentUserId: vi.fn(),
  templateUpsert: vi.fn(),
  userFindUnique: vi.fn(),
  appRequestCreate: vi.fn(),
  appRequestUpdate: vi.fn(),
  buildSourceSnapshot: vi.fn(),
  bootstrapManagedRepository: vi.fn(),
  grantManagedRepositoryAccess: vi.fn(),
  recordAuditEvent: vi.fn(),
  safeNotifyAppEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: mocks.resolveCurrentUserId,
}));
vi.mock("@/features/generation/build-source-snapshot", () => ({
  buildSourceSnapshot: mocks.buildSourceSnapshot,
}));
vi.mock("@/features/repositories/bootstrap-managed-repository", () => ({
  bootstrapManagedRepository: mocks.bootstrapManagedRepository,
}));
vi.mock("@/features/repositories/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/repositories/access")>()),
  grantManagedRepositoryAccess: mocks.grantManagedRepositoryAccess,
}));
vi.mock("@/features/notifications/safe-notify", () => ({
  safeNotifyAppEvent: mocks.safeNotifyAppEvent,
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock("@/lib/support-reference", () => ({
  createSupportReference: () => "SUP-20260819-ABC123",
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    template: { upsert: mocks.templateUpsert },
    user: { findUnique: mocks.userFindUnique },
    appRequest: {
      create: mocks.appRequestCreate,
      update: mocks.appRequestUpdate,
    },
  },
}));

import { createAppAction } from "./actions";

function generatedForm() {
  const formData = new FormData();
  formData.set("templateSlug", "public-information-page");
  formData.set("appName", "Campus Dashboard");
  formData.set("description", "Shows campus information.");
  formData.set("hostingTarget", "Azure App Service");
  formData.set("databaseProvider", "none");
  formData.set("entraLogin", "false");
  return formData;
}

describe("createAppAction generated onboarding handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCurrentUserId.mockResolvedValue("user-123");
    mocks.templateUpsert.mockResolvedValue({ id: "template-123" });
    mocks.userFindUnique.mockResolvedValue({ githubUsername: "saved-user" });
    mocks.appRequestCreate.mockResolvedValue({ id: "request-123" });
    mocks.appRequestUpdate.mockResolvedValue({});
    mocks.buildSourceSnapshot.mockResolvedValue({
      "README.md": "# Campus Dashboard\n",
    });
    mocks.bootstrapManagedRepository.mockResolvedValue({
      provider: "GITHUB",
      owner: "cedarville-it",
      name: "campus-dashboard-request-123",
      url: "https://github.com/cedarville-it/campus-dashboard-request-123",
      defaultBranch: "main",
      visibility: "private",
    });
    mocks.recordAuditEvent.mockResolvedValue(undefined);
    mocks.safeNotifyAppEvent.mockResolvedValue(undefined);
  });

  it("does not auto-grant GitHub access when the creator already saved a username", async () => {
    await expect(createAppAction(generatedForm())).rejects.toThrow(
      "redirect:/onboarding/request-123",
    );

    expect(mocks.grantManagedRepositoryAccess).not.toHaveBeenCalled();
    expect(mocks.appRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repositoryAccessStatus: "NOT_REQUESTED",
          repositoryAccessNote: null,
        }),
      }),
    );
  });

  it("redirects generation failures to actionable repository recovery", async () => {
    mocks.buildSourceSnapshot.mockRejectedValue(
      new Error("template read failed: secret=provider-detail"),
    );

    await expect(createAppAction(generatedForm())).rejects.toThrow(
      "redirect:/onboarding/request-123",
    );

    expect(mocks.bootstrapManagedRepository).not.toHaveBeenCalled();
    const failureUpdate = mocks.appRequestUpdate.mock.calls.find(
      ([input]) => input.data.generationStatus === "FAILED",
    )?.[0];
    expect(failureUpdate).toEqual({
      where: { id: "request-123" },
      data: expect.objectContaining({
        generationStatus: "FAILED",
        repositoryStatus: "FAILED",
        publishErrorSummary: expect.not.stringContaining("provider-detail"),
      }),
    });
  });
});
