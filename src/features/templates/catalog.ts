import type { AppServiceRuntime, PortalTemplate, TemplateCategory, TemplateField } from "./types";

const sharedFields: TemplateField[] = [
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
];

const nextAppServiceRuntime: AppServiceRuntime = {
  family: "node",
  framework: "nextjs",
  displayName: "Node.js 24 / Next.js",
  azureRuntimeStack: "NODE|24-lts",
  startupCommand: "npm start",
  workflowFileName: "deploy-azure-app-service.yml",
};

const fastApiAppServiceRuntime: AppServiceRuntime = {
  family: "python",
  framework: "fastapi",
  displayName: "Python 3.14 / FastAPI",
  azureRuntimeStack: "PYTHON|3.14",
  startupCommand:
    "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
  workflowFileName: "deploy-azure-app-service.yml",
};

const templates: PortalTemplate[] = [
  {
    id: "department-form-approval-v1",
    slug: "department-form-approval",
    sourceTemplateSlug: "web-app",
    name: "Department Form + Approval",
    description:
      "A guided request form starter with reviewer approval and Cedarville sign-in.",
    decisionSummary:
      "Use this when a department needs a structured request form with reviewer approval and a searchable record of submissions.",
    bestFor: [
      "Department intake forms",
      "Approval workflows",
      "Requests that need staff sign-in",
    ],
    category: "recommended",
    hostingTarget: "Azure App Service",
    appServiceRuntime: nextAppServiceRuntime,
    features: {
      database: {
        mode: "required",
        providerOptions: ["postgresql"],
        defaultProvider: "postgresql",
      },
      entraLogin: {
        mode: "required",
        defaultEnabled: true,
      },
    },
    version: "1.0.0",
    status: "ACTIVE",
    fields: sharedFields,
  },
  {
    id: "simple-data-tracker-v1",
    slug: "simple-data-tracker",
    sourceTemplateSlug: "web-app",
    name: "Simple Data Tracker",
    description:
      "A shared internal tracker starter for replacing small spreadsheet-driven workflows.",
    decisionSummary:
      "Use this when your team currently tracks something in a spreadsheet and needs shared editing, filtering, and history.",
    bestFor: [
      "Equipment or room lists",
      "Program rosters",
      "Shared checklists",
    ],
    category: "recommended",
    hostingTarget: "Azure App Service",
    appServiceRuntime: nextAppServiceRuntime,
    features: {
      database: {
        mode: "required",
        providerOptions: ["postgresql"],
        defaultProvider: "postgresql",
      },
      entraLogin: {
        mode: "required",
        defaultEnabled: true,
      },
    },
    version: "1.0.0",
    status: "ACTIVE",
    fields: sharedFields,
  },
  {
    id: "public-information-page-v1",
    slug: "public-information-page",
    sourceTemplateSlug: "web-app",
    name: "Public Information Page",
    description:
      "A simple Cedarville-styled page or small site starter without login or stored data.",
    decisionSummary:
      "Use this when you need a polished web page or small site, but do not need logins, workflows, or stored data.",
    bestFor: [
      "Program information pages",
      "Resource pages",
      "Small public-facing sites",
    ],
    category: "recommended",
    hostingTarget: "Azure App Service",
    appServiceRuntime: nextAppServiceRuntime,
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
    fields: sharedFields,
  },
  {
    id: "web-app-v1",
    slug: "web-app",
    name: "Custom Web App",
    description:
      "A Cedarville-styled full-stack web application starter for Azure App Service.",
    decisionSummary:
      "Use this when you want to start from a blank Cedarville-styled web app with flexible pages, forms, and server-side logic.",
    bestFor: [
      "Staff-facing web apps",
      "Forms and dashboards",
      "Apps that need frontend and backend code together",
    ],
    category: "developer",
    hostingTarget: "Azure App Service",
    appServiceRuntime: nextAppServiceRuntime,
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
    fields: sharedFields,
  },
  {
    id: "python-fastapi-v1",
    slug: "python-fastapi",
    name: "API / Automation Service",
    description:
      "A compact Python API starter for Azure App Service with FastAPI health and sample routes.",
    decisionSummary:
      "Use this when the app's main job is processing data, receiving requests, connecting systems, or using Python libraries. Database and Entra login can be enabled when needed.",
    bestFor: [
      "Python APIs",
      "Automation endpoints",
      "Data-adjacent service backends",
      "Apps that may need PostgreSQL or Cedarville login",
    ],
    category: "developer",
    hostingTarget: "Azure App Service",
    appServiceRuntime: fastApiAppServiceRuntime,
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
    version: "1.0.0",
    status: "ACTIVE",
    fields: sharedFields,
  },
];

const templateGroupLabels: Record<TemplateCategory, string> = {
  recommended: "Recommended Templates",
  developer: "Developer Starters",
};

export function getActiveTemplates() {
  return templates.filter((template) => template.status === "ACTIVE");
}

export function getActiveTemplateGroups() {
  const activeTemplates = getActiveTemplates();
  const categories: TemplateCategory[] = ["recommended", "developer"];

  return categories
    .map((category) => ({
      category,
      label: templateGroupLabels[category],
      templates: activeTemplates.filter(
        (template) => template.category === category,
      ),
    }))
    .filter((group) => group.templates.length > 0);
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
      category: template.category,
      ...(template.sourceTemplateSlug
        ? { sourceTemplateSlug: template.sourceTemplateSlug }
        : {}),
      decisionSummary: template.decisionSummary,
      bestFor: template.bestFor,
      appServiceRuntime: template.appServiceRuntime,
      features: template.features,
    },
    hostingOptions:
      hostingTargetField?.type === "select" ? hostingTargetField.options : [],
  };
}
