import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { getTemplateBySlug } from "@/features/templates/catalog";

function toSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "") || "app"
  );
}

export function buildTokenMap(input: CreateAppRequestInput) {
  const template = getTemplateBySlug(input.templateSlug);

  if (!template) {
    throw new Error(`Template "${input.templateSlug}" not found.`);
  }

  return {
    APP_NAME: input.appName,
    APP_NAME_SLUG: toSlug(input.appName),
    APP_NAME_JS: JSON.stringify(input.appName),
    APP_DESCRIPTION: input.description,
    APP_DESCRIPTION_JS: JSON.stringify(input.description),
    HOSTING_TARGET: input.hostingTarget,
    DATABASE_PROVIDER: input.databaseProvider,
    ENTRA_LOGIN_ENABLED: String(input.entraLogin),
    AZURE_RUNTIME_STACK: template.appServiceRuntime.azureRuntimeStack,
    APP_SERVICE_RUNTIME: template.appServiceRuntime.displayName,
  };
}
