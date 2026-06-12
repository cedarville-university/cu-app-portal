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

type AppServiceRuntimeBase = {
  displayName: string;
  startupCommand: string;
  workflowFileName: string;
};

export type AppServiceRuntime =
  | (AppServiceRuntimeBase & {
      family: "node";
      framework: "nextjs" | "express";
      azureRuntimeStack: `NODE|${string}`;
    })
  | (AppServiceRuntimeBase & {
      family: "python";
      framework: "fastapi" | "http-server";
      azureRuntimeStack: `PYTHON|${string}`;
    })
  | (AppServiceRuntimeBase & {
      family: "java";
      framework: "spring-boot";
      azureRuntimeStack: `JAVA|${string}`;
    });

export type FeatureMode = "unsupported" | "optional" | "required";
export type DatabaseProvider = "none" | "postgresql";
type EnabledDatabaseProvider = Exclude<DatabaseProvider, "none">;

export type TemplateDatabaseFeature =
  | {
      mode: "unsupported";
      providerOptions: [];
      defaultProvider: "none";
    }
  | {
      mode: "optional";
      providerOptions: [EnabledDatabaseProvider, ...EnabledDatabaseProvider[]];
      defaultProvider: DatabaseProvider;
    }
  | {
      mode: "required";
      providerOptions: [EnabledDatabaseProvider, ...EnabledDatabaseProvider[]];
      defaultProvider: EnabledDatabaseProvider;
    };

export type TemplateFeatures = {
  database: TemplateDatabaseFeature;
  entraLogin:
    | {
        mode: "unsupported";
        defaultEnabled: false;
      }
    | {
        mode: "optional";
        defaultEnabled: boolean;
      }
    | {
        mode: "required";
        defaultEnabled: true;
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
