import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalTemplate } from "@/features/templates/types";
import { TemplateForm } from "./template-form";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("@/app/create/actions", () => ({
  createAppAction: vi.fn(),
}));

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

const template = buildTemplate();

describe("TemplateForm", () => {
  beforeEach(() => {
    mockUseFormStatus.mockReturnValue({ pending: false });
  });

  afterEach(() => {
    cleanup();
  });

  it("disables submit and shows progress text while generation is pending", () => {
    mockUseFormStatus.mockReturnValue({ pending: true });

    render(<TemplateForm template={template} />);

    expect(
      screen.getByRole("button", { name: /creating/i }),
    ).toBeDisabled();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      /creating your app package/i,
    );
  });

  it("shows create-only and one-step publish submit actions for Azure templates", () => {
    render(<TemplateForm template={template} />);

    expect(screen.getByRole("button", { name: "Create App" })).toHaveAttribute(
      "name",
      "createIntent",
    );
    expect(screen.getByRole("button", { name: "Create App" })).toHaveAttribute(
      "value",
      "createOnly",
    );
    expect(
      screen.getByRole("button", { name: "Create and Publish" }),
    ).toHaveAttribute("name", "createIntent");
    expect(
      screen.getByRole("button", { name: "Create and Publish" }),
    ).toHaveAttribute("value", "createAndPublish");
  });
});
