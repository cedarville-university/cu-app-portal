export type TemplateField =
  | {
      name: "appName";
      label: "App Name";
      type: "text";
      required: true;
    }
  | {
      name: "description";
      label: "Short Description";
      type: "textarea";
      required: true;
    }
  | {
      name: "hostingTarget";
      label: "Hosting Target";
      type: "select";
      required: true;
      options: string[];
    };

export type AppServiceRuntimeFamily = "node" | "python" | "java";

export type AppServiceRuntime = {
  family: AppServiceRuntimeFamily;
  framework: "nextjs" | "express" | "fastapi" | "spring-boot";
  displayName: string;
  azureRuntimeStack: string;
  startupCommand: string;
  workflowFileName: string;
};

export type FeatureMode = "unsupported" | "optional" | "required";
export type DatabaseProvider = "none" | "postgresql";

export type TemplateFeatures = {
  database: {
    mode: FeatureMode;
    providerOptions: Exclude<DatabaseProvider, "none">[];
    defaultProvider: DatabaseProvider;
  };
  entraLogin: {
    mode: FeatureMode;
    defaultEnabled: boolean;
  };
};

export type PortalTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string;
  decisionSummary: string;
  bestFor: string[];
  hostingTarget: "Azure App Service";
  appServiceRuntime: AppServiceRuntime;
  features: TemplateFeatures;
  version: string;
  status: "ACTIVE" | "DISABLED";
  fields: TemplateField[];
};
