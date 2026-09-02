import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
      screen.getByRole("button", { name: /launching your app/i }),
    ).toBeDisabled();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      /launching your app and its private code repository/i,
    );
  });

  it("shows only the repository-only create submit action", () => {
    render(<TemplateForm template={template} />);

    const submitButton = screen.getByRole("button", { name: "Launch App" });

    expect(submitButton).toBeEnabled();
    expect(submitButton).toHaveAttribute("name", "createIntent");
    expect(submitButton).toHaveAttribute("value", "createOnly");
    expect(
      screen.queryByRole("button", { name: "Create and Publish" }),
    ).not.toBeInTheDocument();
  });

  it("requires the user to choose the app audience", () => {
    render(<TemplateForm template={template} />);

    expect(screen.getByRole("group", { name: /database/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/postgresql/i)).toBeChecked();
    expect(
      screen.getByRole("group", { name: /who can use this app/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Cedarville sign-in required")).not.toBeChecked();
    expect(
      screen.getByLabelText("Openly public on the internet"),
    ).not.toBeChecked();
  });

  it("submits explicit values when optional features are turned off", () => {
    const { container } = render(<TemplateForm template={template} />);
    const form = container.querySelector("form");

    expect(form).not.toBeNull();

    fireEvent.click(screen.getByLabelText(/no database/i));
    fireEvent.click(screen.getByLabelText("Openly public on the internet"));
    fireEvent.click(
      screen.getByLabelText(/I understand that anyone who knows or discovers/i),
    );

    const formData = new FormData(form!);

    expect(formData.get("databaseProvider")).toBe("none");
    expect(formData.get("entraLogin")).toBe("false");
  });
});
