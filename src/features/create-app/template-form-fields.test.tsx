import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getTemplateBySlug } from "@/features/templates/catalog";
import type { PortalTemplate } from "@/features/templates/types";
import { TemplateFormFields } from "./template-form-fields";

afterEach(() => {
  cleanup();
});

function buildTemplate(overrides: Partial<PortalTemplate> = {}): PortalTemplate {
  return {
    id: "web-app-v1",
    slug: "web-app",
    name: "Next.js Web App",
    description:
      "A Cedarville-styled full-stack web application starter for Azure App Service.",
    decisionSummary:
      "Choose this when you need pages, forms, server-side logic, and Cedarville-styled UI in one project.",
    bestFor: ["Staff-facing web apps", "Forms and dashboards"],
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
        mode: "optional",
        providerOptions: ["postgresql"],
        defaultProvider: "postgresql",
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
        name: "hostingTarget",
        label: "Hosting Target",
        type: "select",
        required: true,
        options: ["Azure App Service"],
      },
    ],
    ...overrides,
  };
}

describe("TemplateFormFields", () => {
  it("shows optional database and an explicit audience choice for the web app template", () => {
    render(<TemplateFormFields template={buildTemplate()} />);

    expect(
      screen.getByRole("group", { name: /database/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/postgresql/i)).toBeChecked();
    expect(screen.getByLabelText(/no database/i)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /who can use this app/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /cedarville sign-in required/i })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /openly public on the internet/i })).not.toBeChecked();
  });

  it("renders an explicit audience choice for FastAPI", () => {
    const template = getTemplateBySlug("python-fastapi");

    if (!template) {
      throw new Error("python-fastapi template missing");
    }

    render(<TemplateFormFields template={template} />);

    expect(
      screen.getByRole("group", { name: /database/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /postgresql/i }),
    ).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /no database/i })).toBeChecked();
    expect(screen.getByRole("group", { name: /who can use this app/i })).toBeInTheDocument();
  });

  it("lets workflow presets choose an audience", () => {
    const template = getTemplateBySlug("department-form-approval");

    if (!template) {
      throw new Error("department-form-approval template missing");
    }

    const { container } = render(<TemplateFormFields template={template} />);

    expect(
      container.querySelector('input[name="databaseProvider"]'),
    ).toHaveAttribute("value", "postgresql");
    expect(container.querySelector('input[name="entraLogin"]')).toHaveAttribute(
      "type",
      "radio",
    );
  });

  it("lets public information pages choose an audience", () => {
    const template = getTemplateBySlug("public-information-page");

    if (!template) {
      throw new Error("public-information-page template missing");
    }

    const { container } = render(<TemplateFormFields template={template} />);

    expect(
      container.querySelector('input[name="databaseProvider"]'),
    ).toHaveAttribute("value", "none");
    expect(container.querySelector('input[name="entraLogin"]')).toHaveAttribute(
      "type",
      "radio",
    );
  });

  it("still shows the audience choice when legacy template metadata marks login unsupported", () => {
    const { container } = render(
      <TemplateFormFields
        template={buildTemplate({
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
        })}
      />,
    );
    const databaseInput = container.querySelector(
      'input[name="databaseProvider"]',
    );
    const entraInput = container.querySelector('input[name="entraLogin"]');

    expect(databaseInput).toHaveAttribute("type", "hidden");
    expect(databaseInput).toHaveAttribute("value", "none");
    expect(entraInput).toHaveAttribute("type", "radio");
  });

  it("submits a single select option without showing a visible choice", () => {
    const { container } = render(
      <TemplateFormFields
        template={buildTemplate({
          fields: [
            {
              name: "hostingTarget",
              label: "Hosting Target",
              type: "select",
              required: true,
              options: ["Azure App Service"],
            },
          ],
        })}
      />,
    );

    expect(
      screen.queryByRole("combobox", { name: /hosting target/i }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('input[type="hidden"][name="hostingTarget"]'),
    ).toHaveAttribute("value", "Azure App Service");
  });

  it("shows a select when a field has multiple options", () => {
    render(
      <TemplateFormFields
        template={buildTemplate({
          fields: [
            {
              name: "hostingTarget",
              label: "Hosting Target",
              type: "select",
              required: true,
              options: ["Azure App Service", "Static Site"],
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: /hosting target/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Azure App Service" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Static Site" }),
    ).toBeInTheDocument();
  });

  it("fails fast for unsupported field types", () => {
    expect(() =>
      render(
        <TemplateFormFields
          template={
            {
              id: "invalid",
              slug: "invalid",
              name: "Invalid",
              description: "Invalid",
              version: "1.0.0",
              status: "ACTIVE",
              fields: [
                {
                  name: "mystery",
                  label: "Mystery",
                  type: "checkbox",
                  required: true,
                },
              ],
            } as never
          }
        />,
      ),
    ).toThrow(/unsupported template field type/i);
  });
});
