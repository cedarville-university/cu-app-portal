import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { buildPublishingFiles } from "./publishing-files";

export function buildInstructionFiles(input: CreateAppRequestInput) {
  return {
    ...buildPublishingFiles(input),
    "docs/github-setup.md": `# GitHub Setup

1. Prefer the portal-managed GitHub repository created for ${input.appName}.
2. Treat that managed repository as the supported source of truth for portal publishing.
3. Your selected hosting target is ${input.hostingTarget}.
4. This archive still includes the recommended publishing docs in docs/publishing/.
5. Start with docs/publishing/azure-app-service.md for the GitHub + Azure App Service path.
6. Use docs/publishing/lessons-learned.md for recovery notes and operational lessons.`,
    "docs/deployment-guide.md": `# Deployment Guide

Your selected hosting target is ${input.hostingTarget}, and this archive still includes the recommended GitHub + Azure App Service publishing path.
Read docs/publishing/azure-app-service.md first, then check docs/publishing/lessons-learned.md for the operational details.

The portal-managed repository and configured AZURE_PUBLISH_* target values are authoritative for supported publishing. The ZIP and generated manifest are fallback handoff aids.`,
  };
}
