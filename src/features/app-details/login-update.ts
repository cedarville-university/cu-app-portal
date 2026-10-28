import { getTemplateBySlug } from "@/features/templates/catalog";
import type { LoginUpdateFramework } from "@/features/repositories/entra-login-guidance";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getLoginUpdateFramework(app: {
  submittedConfig: unknown;
  templateVersion?: string;
  sourceOfTruth?: string;
  template?: { slug: string };
}): LoginUpdateFramework | null {
  const config = record(app.submittedConfig);
  const imported = app.sourceOfTruth === "IMPORTED_REPOSITORY";
  const slug = typeof config.templateSlug === "string"
    ? config.templateSlug
    : app.template?.slug;
  const template = slug ? getTemplateBySlug(slug) : undefined;
  const importedLogin = record(config.importFeatures).entraLogin;
  // Older generated apps predate the audience choice; use the same template
  // defaults that publishing uses when no explicit choice was recorded.
  const login = typeof config.entraLogin === "boolean"
    ? config.entraLogin
    : typeof importedLogin === "boolean"
      ? importedLogin
      : imported || template?.features.entraLogin.defaultEnabled === true;
  if (!login) return null;
  if (imported) {
    // Importing/preparing a repository does not replace its application code.
    const framework = record(config.importRuntime).framework ?? "nextjs";
    return framework === "nextjs" || framework === "express" ? framework : null;
  }
  if (template?.appServiceRuntime.framework !== "nextjs") return null;
  const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(app.templateVersion ?? "");
  const needsUpdate = (
    !version || Number(version[1]) < 1 ||
    (Number(version[1]) === 1 && Number(version[2]) < 1)
  );
  return needsUpdate ? "nextjs" : null;
}

export function needsLoginUpdateNotice(
  app: Parameters<typeof getLoginUpdateFramework>[0],
) {
  return getLoginUpdateFramework(app) !== null;
}
