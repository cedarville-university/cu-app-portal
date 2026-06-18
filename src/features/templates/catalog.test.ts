import { describe, expect, it } from "vitest";
import {
  getActiveTemplateBySlug,
  getActiveTemplateGroups,
  getActiveTemplates,
  getTemplateBySlug,
  serializeTemplateForStorage,
} from "./catalog";

describe("getActiveTemplates", () => {
  it("returns at least one active template", () => {
    const templates = getActiveTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]?.slug).toBe("department-form-approval");
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
      "department-form-approval",
      "simple-data-tracker",
      "public-information-page",
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

  it("groups templates for non-technical users before developer starters", () => {
    expect(getActiveTemplateGroups()).toEqual([
      {
        category: "recommended",
        label: "Recommended Templates",
        templates: [
          expect.objectContaining({ slug: "department-form-approval" }),
          expect.objectContaining({ slug: "simple-data-tracker" }),
          expect.objectContaining({ slug: "public-information-page" }),
        ],
      },
      {
        category: "developer",
        label: "Developer Starters",
        templates: [
          expect.objectContaining({ slug: "web-app", name: "Custom Web App" }),
          expect.objectContaining({
            slug: "python-fastapi",
            name: "API / Automation Service",
          }),
        ],
      },
    ]);
  });

  it("defines recommended presets over the shared web app source", () => {
    expect(getTemplateBySlug("department-form-approval")).toMatchObject({
      category: "recommended",
      sourceTemplateSlug: "web-app",
      appServiceRuntime: {
        family: "node",
        framework: "nextjs",
      },
      features: {
        database: { mode: "required", defaultProvider: "postgresql" },
        entraLogin: { mode: "required", defaultEnabled: true },
      },
    });
    expect(getTemplateBySlug("simple-data-tracker")).toMatchObject({
      category: "recommended",
      sourceTemplateSlug: "web-app",
      features: {
        database: { mode: "required", defaultProvider: "postgresql" },
        entraLogin: { mode: "required", defaultEnabled: true },
      },
    });
    expect(getTemplateBySlug("public-information-page")).toMatchObject({
      category: "recommended",
      sourceTemplateSlug: "web-app",
      features: {
        database: { mode: "unsupported", defaultProvider: "none" },
        entraLogin: { mode: "unsupported", defaultEnabled: false },
      },
    });
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
        category: "developer",
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
      name: "API / Automation Service",
      category: "developer",
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
          mode: "optional",
          providerOptions: ["postgresql"],
          defaultProvider: "none",
        },
        entraLogin: {
          mode: "optional",
          defaultEnabled: false,
        },
      },
    });
    expect(template?.decisionSummary).toMatch(/database/i);
    expect(template?.decisionSummary).toMatch(/Entra/i);
    expect(template?.bestFor).toContain(
      "Apps that may need PostgreSQL or Cedarville login",
    );
  });
});
