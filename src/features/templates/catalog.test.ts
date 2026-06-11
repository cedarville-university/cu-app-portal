import { describe, expect, it } from "vitest";
import {
  getActiveTemplateBySlug,
  getActiveTemplates,
  getTemplateBySlug,
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

    expect(templates.map((template) => template.slug)).toEqual([
      "web-app",
      "python-fastapi",
    ]);
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
      inputSchema: {
        fields: template.fields,
        decisionSummary: template.decisionSummary,
        bestFor: template.bestFor,
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
            mode: "optional",
            providerOptions: ["postgresql"],
            defaultProvider: "postgresql",
          },
          entraLogin: {
            mode: "optional",
            defaultEnabled: true,
          },
        },
      },
    });
  });

  it("keeps the FastAPI template runtime metadata ready for Azure App Service", () => {
    const template = getTemplateBySlug("python-fastapi");

    expect(template).toMatchObject({
      slug: "python-fastapi",
      status: "ACTIVE",
      appServiceRuntime: {
        family: "python",
        framework: "fastapi",
        displayName: "Python 3.14 / FastAPI",
        azureRuntimeStack: "PYTHON|3.14",
        startupCommand:
          "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
        workflowFileName: "deploy-azure-app-service.yml",
      },
      features: {
        database: {
          mode: "unsupported",
          providerOptions: [],
          defaultProvider: "none",
        },
        entraLogin: {
          mode: "unsupported",
          defaultEnabled: false,
        },
      },
    });
  });
});
