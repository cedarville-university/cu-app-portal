import type { PortalTemplate } from "./types";

const templates: PortalTemplate[] = [
  {
    id: "web-app-v1",
    slug: "web-app",
    name: "Next.js Web App",
    description:
      "A Cedarville-styled full-stack web application starter for Azure App Service.",
    decisionSummary:
      "Choose this when you need pages, forms, server-side logic, and Cedarville-styled UI in one project.",
    bestFor: [
      "Staff-facing web apps",
      "Forms and dashboards",
      "Apps that need frontend and backend code together",
    ],
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
        name: "description",
        label: "Short Description",
        type: "textarea",
        required: true,
      },
      {
        name: "hostingTarget",
        label: "Hosting Target",
        type: "select",
        required: true,
        options: ["Azure App Service"],
      },
    ],
  },
  {
    id: "python-fastapi-v1",
    slug: "python-fastapi",
    name: "Python FastAPI",
    description:
      "A compact Python API starter for Azure App Service with FastAPI health and sample routes.",
    decisionSummary:
      "Choose this for Python-backed APIs, automation endpoints, and services that benefit from Python libraries.",
    bestFor: [
      "Python APIs",
      "Automation endpoints",
      "Data-adjacent service backends",
    ],
    hostingTarget: "Azure App Service",
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
    version: "1.0.0",
    status: "ACTIVE",
    fields: [
      { name: "appName", label: "App Name", type: "text", required: true },
      {
        name: "description",
        label: "Short Description",
        type: "textarea",
        required: true,
      },
      {
        name: "hostingTarget",
        label: "Hosting Target",
        type: "select",
        required: true,
        options: ["Azure App Service"],
      },
    ],
  },
];

export function getActiveTemplates() {
  return templates.filter((template) => template.status === "ACTIVE");
}

export function getActiveTemplateBySlug(slug: string) {
  return getActiveTemplates().find((template) => template.slug === slug) ?? null;
}

export function getTemplateBySlug(slug: string) {
  return templates.find((template) => template.slug === slug) ?? null;
}

export function serializeTemplateForStorage(template: PortalTemplate) {
  const hostingTargetField = template.fields.find(
    (field) => field.name === "hostingTarget",
  );

  return {
    slug: template.slug,
    name: template.name,
    description: template.description,
    version: template.version,
    status: template.status,
    inputSchema: {
      fields: template.fields,
      decisionSummary: template.decisionSummary,
      bestFor: template.bestFor,
      appServiceRuntime: template.appServiceRuntime,
      features: template.features,
    },
    hostingOptions:
      hostingTargetField?.type === "select" ? hostingTargetField.options : [],
  };
}
