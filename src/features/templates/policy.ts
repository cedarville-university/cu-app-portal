import type { PortalTemplate, TemplateAudience } from "./types";

export function getTemplatePolicy(template: PortalTemplate) {
  return {
    applicationKind: template.applicationKind ?? "web-app",
    authenticationMode: template.authenticationMode ?? "browser",
    audience: template.audience ?? { cedarville: true, public: true } satisfies TemplateAudience,
  };
}
