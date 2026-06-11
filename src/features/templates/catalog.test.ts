import { describe, expect, it } from "vitest";
import {
  getActiveTemplateBySlug,
  getActiveTemplates,
  serializeTemplateForStorage,
} from "./catalog";

describe("getActiveTemplates", () => {
  it("returns at least one active template", () => {
    const templates = getActiveTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]?.slug).toBe("web-app");
  });

  it("keeps the current web-app template Azure-only in UI and stored metadata", () => {
    const template = getActiveTemplates()[0];

    expect(template).toBeTruthy();
    expect(
      template?.fields.find((field) => field.name === "hostingTarget"),
    ).toEqual({
      name: "hostingTarget",
      label: "Hosting Target",
      type: "select",
      required: true,
      options: ["Azure App Service"],
    });

    expect(serializeTemplateForStorage(template!)).toMatchObject({
      hostingOptions: ["Azure App Service"],
    });
  });

  it("describes active templates with decision-focused runtime metadata", () => {
    const templates = getActiveTemplates();

    expect(templates.map((template) => template.slug)).toEqual(["web-app"]);
    for (const template of templates) {
      expect(template.decisionSummary.length).toBeGreaterThan(20);
      expect(template.bestFor.length).toBeGreaterThan(0);
      expect(template.appServiceRuntime.azureRuntimeStack).toMatch(/\|/);
      expect(template.features.database.mode).toMatch(
        /optional|required|unsupported/,
      );
      expect(template.features.entraLogin.mode).toMatch(
        /optional|required|unsupported/,
      );
    }
  });

  it("serializes capability metadata for storage", () => {
    const template = getActiveTemplateBySlug("web-app");

    if (!template) {
      throw new Error("Missing active web-app template fixture");
    }

    expect(serializeTemplateForStorage(template)).toMatchObject({
      hostingOptions: ["Azure App Service"],
      inputSchema: expect.objectContaining({
        fields: template.fields,
        decisionSummary: template.decisionSummary,
        bestFor: template.bestFor,
        appServiceRuntime: expect.objectContaining({
          family: "node",
          framework: "nextjs",
          azureRuntimeStack: "NODE|24-lts",
        }),
        features: expect.objectContaining({
          database: expect.objectContaining({
            mode: "optional",
            defaultProvider: "postgresql",
          }),
          entraLogin: expect.objectContaining({
            mode: "optional",
            defaultEnabled: true,
          }),
        }),
      }),
    });
  });
});
