import { getActiveTemplates } from "./catalog";
import { getTemplatePolicy } from "./policy";
import type { FeatureMode } from "./types";

export type PortalTemplateSummary = {
  slug: string;
  name: string;
  description: string;
  decisionSummary: string;
  bestFor: string[];
  category: "recommended" | "developer" | "advanced";
  applicationKind: "web-app" | "mcp-server";
  authenticationMode: "browser" | "entra-mcp";
  hostingTarget: "Azure App Service";
  database: {
    mode: FeatureMode;
    options: Array<"postgresql" | "none">;
  };
  audience: { cedarville: boolean; public: boolean };
};

export function listPortalTemplateSummaries(): PortalTemplateSummary[] {
  return getActiveTemplates().map((template) => ({
    slug: template.slug,
    name: template.name,
    description: template.description,
    decisionSummary: template.decisionSummary,
    bestFor: template.bestFor,
    category: template.category,
    hostingTarget: template.hostingTarget,
    database: {
      mode: template.features.database.mode,
      options: [
        ...template.features.database.providerOptions,
        ...(template.features.database.mode === "required" ? [] : ["none" as const]),
      ],
    },
    ...getTemplatePolicy(template),
  }));
}
