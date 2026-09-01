// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  resolveCurrentUserId: vi.fn(),
  createGeneratedApp: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: mocks.resolveCurrentUserId,
}));
vi.mock("@/features/app-requests/create-generated-app", () => ({
  createGeneratedApp: mocks.createGeneratedApp,
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
  formData.set("publicAcknowledgement", "on");
  return formData;
}

describe("createAppAction generated onboarding handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCurrentUserId.mockResolvedValue("user-123");
    mocks.createGeneratedApp.mockResolvedValue({
      requestId: "request-123",
      supportReference: "SUP-20260901-ABC123",
      generationStatus: "SUCCEEDED",
      repositoryStatus: "READY",
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard-request-123",
    });
  });

  it("passes the authenticated portal actor and validated input to the shared service", async () => {
    await expect(createAppAction(generatedForm())).rejects.toThrow(
      "redirect:/onboarding/request-123",
    );

    expect(mocks.createGeneratedApp).toHaveBeenCalledWith({
      actorUserId: "user-123",
      input: expect.objectContaining({
        templateSlug: "public-information-page",
        appName: "Campus Dashboard",
      }),
      source: "portal-ui",
    });
  });

  it("keeps the onboarding redirect when the shared service reports recoverable failure", async () => {
    mocks.createGeneratedApp.mockResolvedValue({
      requestId: "request-123",
      supportReference: "SUP-20260901-ABC123",
      generationStatus: "FAILED",
      repositoryStatus: "FAILED",
      repositoryUrl: null,
    });

    await expect(createAppAction(generatedForm())).rejects.toThrow(
      "redirect:/onboarding/request-123",
    );
  });
});
