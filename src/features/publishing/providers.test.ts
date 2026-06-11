import { describe, expect, it } from "vitest";
import {
  getPublishingProviderCapabilities,
  supportsGeneratedTemplateOneStep,
  supportsPostSuccessPushToDeploy,
} from "./providers";
import { getTemplateBySlug } from "@/features/templates/catalog";

describe("publishing provider capabilities", () => {
  it("reports Azure App Service as portal-dispatched with post-success push opt-in", () => {
    expect(getPublishingProviderCapabilities("Azure App Service")).toMatchObject({
      hostingTarget: "Azure App Service",
      supportsGeneratedTemplateOneStep: true,
      supportsPostSuccessPushToDeploy: true,
      triggerPolicy: "portal_dispatch",
      workflowPath: ".github/workflows/deploy-azure-app-service.yml",
      workflowFileName: "deploy-azure-app-service.yml",
      requiredSecrets: [
        "AZURE_CLIENT_ID",
        "AZURE_TENANT_ID",
        "AZURE_SUBSCRIPTION_ID",
        "AZURE_WEBAPP_NAME",
      ],
    });
  });

  it("returns null and false capability checks for unknown hosting targets", () => {
    expect(getPublishingProviderCapabilities("Vercel")).toBeNull();
    expect(supportsPostSuccessPushToDeploy("Vercel")).toBe(false);
  });

  it("reports one-step generated publishing support from template metadata", () => {
    const webAppTemplate = getTemplateBySlug("web-app");
    const fastApiTemplate = getTemplateBySlug("python-fastapi");

    expect(webAppTemplate).not.toBeNull();
    expect(fastApiTemplate).not.toBeNull();
    expect(supportsGeneratedTemplateOneStep(webAppTemplate!)).toBe(true);
    expect(supportsGeneratedTemplateOneStep(fastApiTemplate!)).toBe(true);
  });
});
