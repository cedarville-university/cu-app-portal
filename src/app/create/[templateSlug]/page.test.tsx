import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TemplatePage from "./page";

const mockNotFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("notFound");
}));

const mockGetActiveTemplateBySlug = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

vi.mock("@/app/create/actions", () => ({
  createAppAction: vi.fn(),
}));

vi.mock("@/features/auth/logout", () => ({
  logoutAction: vi.fn(),
}));

vi.mock("@/features/templates/catalog", () => ({
  getActiveTemplateBySlug: mockGetActiveTemplateBySlug,
}));

const webAppTemplate = {
  id: "web-app-v1",
  slug: "web-app",
  name: "Web App Starter",
  description:
    "A Cedarville-styled web application starter with Entra setup guidance.",
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
  ],
};

describe("TemplatePage", () => {
  it("renders the selected template form", async () => {
    mockGetActiveTemplateBySlug.mockReturnValue(webAppTemplate);

    render(
      await TemplatePage({
        params: Promise.resolve({ templateSlug: "web-app" }),
      }),
    );
    expect(
      screen.getByRole("heading", { name: /web app starter/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/app name/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /choose this when you need pages, forms, server-side logic/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Node.js 24 / Next.js")).toBeInTheDocument();
    expect(screen.getByText("Staff-facing web apps")).toBeInTheDocument();
    expect(screen.getByText(/database: optional/i)).toBeInTheDocument();
    expect(screen.getByText(/login: entra available/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no github account yet/i),
    ).toBeInTheDocument();
  });

  it("treats disabled templates as not found", async () => {
    mockGetActiveTemplateBySlug.mockReturnValue(null);

    await expect(
      TemplatePage({
        params: Promise.resolve({ templateSlug: "legacy-web-app" }),
      }),
    ).rejects.toThrow("notFound");
  });

  it("treats unknown templates as not found", async () => {
    mockGetActiveTemplateBySlug.mockReturnValue(null);

    await expect(
      TemplatePage({
        params: Promise.resolve({ templateSlug: "missing" }),
      }),
    ).rejects.toThrow("notFound");
  });
});
