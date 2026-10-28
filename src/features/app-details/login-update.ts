import { getTemplateBySlug } from "@/features/templates/catalog";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function needsLoginUpdateNotice(app: {
  submittedConfig: unknown;
  templateVersion?: string;
  sourceOfTruth?: string;
  template?: { slug: string };
}) {
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
  if (!login) return false;
  if (imported) {
    // Importing/preparing a repository does not replace its application code.
    return (record(config.importRuntime).framework ?? "nextjs") === "nextjs";
  }
  if (template?.appServiceRuntime.framework !== "nextjs") return false;
  const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(app.templateVersion ?? "");
  return (
    !version || Number(version[1]) < 1 ||
    (Number(version[1]) === 1 && Number(version[2]) < 1)
  );
}
