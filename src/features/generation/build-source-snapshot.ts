import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import {
  buildDeploymentManifest,
  type DeploymentManifestInput,
} from "./deployment-manifest";
import { buildInstructionFiles } from "./instruction-files";
import { renderTemplateString } from "./render-template";
import { buildTokenMap } from "./token-replacements";
import { getTemplateBySlug } from "@/features/templates/catalog";

type TemplateManifest = {
  slug: string;
  version: string;
  entryFiles: string[];
  generatedFiles: string[];
  generatedOverrides?: string[];
};

function stripTemplateExtension(filePath: string) {
  return filePath.endsWith(".template")
    ? filePath.slice(0, -".template".length)
    : filePath;
}

async function loadTemplateManifest(templateSlug: string) {
  const manifestPath = path.join(
    process.cwd(),
    "templates",
    templateSlug,
    "template.json",
  );
  const manifest = await readFile(manifestPath, "utf8");

  return JSON.parse(manifest) as TemplateManifest;
}

function assertTemplateManifestMatchesCatalog(
  templateSlug: string,
  manifest: TemplateManifest,
) {
  const template = getTemplateBySlug(templateSlug);

  if (!template) {
    throw new Error(`Template "${templateSlug}" not found in catalog.`);
  }

  if (manifest.slug !== template.slug) {
    throw new Error(
      `Template manifest slug "${manifest.slug}" does not match catalog slug "${template.slug}".`,
    );
  }

  if (manifest.version !== template.version) {
    throw new Error(
      `Template manifest version "${manifest.version}" does not match catalog version "${template.version}".`,
    );
  }
}

function buildGeneratedTemplateFiles(
  input: CreateAppRequestInput,
): Record<string, string> {
  const instructionFiles = buildInstructionFiles(input);

  if (input.hostingTarget !== "Azure App Service") {
    throw new Error(
      `Deployment manifest generation requires "Azure App Service" hosting, received "${input.hostingTarget}".`,
    );
  }

  const deploymentInput = input as DeploymentManifestInput;
  const deploymentManifest = `${JSON.stringify(
    buildDeploymentManifest(deploymentInput),
    null,
    2,
  )}\n`;

  return {
    ...instructionFiles,
    "README.md": buildReadmeFile(input),
    ".codex/skills/publish-to-azure/SKILL.md": buildPublishSkillFile(input),
    "app-portal/deployment-manifest.json": deploymentManifest,
  };
}

function buildReadmeFile(input: CreateAppRequestInput) {
  const template = getTemplateBySlug(input.templateSlug);

  if (!template) {
    throw new Error(`Template "${input.templateSlug}" not found in catalog.`);
  }

  const databaseText =
    input.databaseProvider === "postgresql"
      ? "Persistent app data is already wired in through `src/lib/app-data.ts`. The portal supplies the production database connection during publish, and the starter applies database updates automatically when it starts in Azure. Most app editors can use the helper functions without needing to configure the database by hand."
      : "This app was generated without a database. Add data storage later only if the app needs persistent state.";
  const localEnvironmentText =
    input.databaseProvider === "postgresql"
      ? "Keep local development on the localhost `DATABASE_URL` in `.env.example`."
      : "Use `.env.example` as the generated local environment reference.";
  const publishResources = [
    ...(input.databaseProvider === "postgresql" ? ["Azure PostgreSQL"] : []),
    "App Service settings",
    ...(input.entraLogin ? ["production auth settings"] : []),
  ];
  const publishResourcesText = `Let the portal provision ${formatList(
    publishResources,
  )} during publish.`;
  const authText = input.entraLogin
    ? "This app is configured for Microsoft Entra login."
    : "This app was generated without built-in login.";

  return `# ${input.appName}

${input.description}

## Hosting Target

This starter is prepared for ${input.hostingTarget}.

## Runtime

Generated runtime: ${template.appServiceRuntime.displayName}.
${authText}

## Next Steps

1. Use the portal-managed GitHub repository as the supported source of truth.
2. Clone or open that managed repository locally when you are ready to customize the app.
3. Run \`npm install\`, then \`npm run dev\` for local development.
4. ${localEnvironmentText}
5. Use the supported publishing path in \`docs/publishing/azure-app-service.md\`.
6. ${publishResourcesText}
7. Record manual steps, blockers, and operator handoff notes in \`docs/publishing/lessons-learned.md\`.
8. Keep \`docs/github-setup.md\` and \`docs/deployment-guide.md\` as fallback handoff docs if automation is blocked.

## App Data

${databaseText}
`;
}

function buildPublishSkillFile(input: CreateAppRequestInput) {
  const hasDatabase = input.databaseProvider === "postgresql";
  const hasEntraLogin = input.entraLogin;
  const databaseBehavior = hasDatabase
    ? `5. Create or verify the Azure resource group, Azure Database for PostgreSQL flexible server, and Azure database described by the manifest.
6. Build the production \`DATABASE_URL\` from the Azure PostgreSQL server, database, admin user, and password, using \`sslmode=require\`.
7. Set the App Service \`DATABASE_URL\` app setting to the Azure database connection string while leaving the local \`.env.example\` value on localhost for development.
8. Create or verify the Azure App Service app described by the manifest.`
    : `5. Create or verify the Azure resource group described by the manifest.
6. This app was generated without a database. Do not provision a managed database or add database connection settings unless the app is intentionally changed later.
7. Create or verify the Azure App Service app described by the manifest.`;
  const workflowStepNumber = hasDatabase ? 9 : 8;
  const packageStepNumber = hasDatabase ? 10 : 9;
  const verifyStepNumber = hasDatabase ? 11 : 10;
  const fallbackStepNumber = hasDatabase ? 12 : 11;
  const databaseNotes = hasDatabase
    ? `- Keep development \`DATABASE_URL\` on localhost and put the production \`DATABASE_URL\` only in Azure App Service settings.`
    : `- This app was generated without a database. Keep publish work focused on the Web App, identity, workflow, and non-database app settings.`;
  const authBehavior = hasEntraLogin
    ? `- Microsoft Entra login is configured. Set \`AUTH_URL\`, \`NEXTAUTH_URL\`, \`AUTH_SECRET\`, \`AUTH_MICROSOFT_ENTRA_ID_ID\`, \`AUTH_MICROSOFT_ENTRA_ID_SECRET\`, and \`AUTH_MICROSOFT_ENTRA_ID_ISSUER\` in Azure App Service settings using the public Azure hostname.
- Confirm the Microsoft Entra app registration includes the production redirect URI before sign-in verification.`
    : `- This app was generated without built-in login. Do not add Microsoft Entra app settings or redirect URI work unless the app is intentionally changed later.`;
  const authNotes = hasEntraLogin
    ? `- Keep Microsoft Entra app settings aligned with the generated manifest and the public App Service URL.`
    : `- This app was generated without built-in login. Keep publish work free of Entra auth app-setting guidance.`;

  return `---
name: publish-to-azure
description: Publish this app to Azure App Service using the generated manifest, GitHub Actions workflow, and fallback docs.
---

# Publish to Azure

Use this skill to publish this app to Azure App Service through the supported GitHub Actions path.

## Required Behavior

1. Read \`app-portal/deployment-manifest.json\` before choosing names, commands, or Azure resources.
2. Check that \`git\`, \`gh\`, and \`az\` are installed and that the current user is authenticated where required.
3. Prefer the managed GitHub repository the portal created for this app, and explain the local git state before creating or updating anything else.
4. Create or connect the GitHub repository only when the portal-managed repo is unavailable or an operator explicitly asks for a manual recovery path.
${databaseBehavior}
${workflowStepNumber}. Wire the deployment workflow in \`.github/workflows/deploy-azure-app-service.yml\`, preferring OpenID Connect with \`AZURE_CLIENT_ID\`, \`AZURE_TENANT_ID\`, and \`AZURE_SUBSCRIPTION_ID\`.
${packageStepNumber}. Prefer the GitHub Actions workflow to build the deployable package and send the built artifact to Azure App Service instead of relying on App Service to Oryx-build the raw repository.
${verifyStepNumber}. Run the safest available verification after wiring deployment and report what succeeded, what still needs manual work, and where the release is now blocked.
${fallbackStepNumber}. If \`gh\` or \`az\` cannot complete the flow, fall back to \`docs/publishing/azure-app-service.md\` and capture the blocked step in \`docs/publishing/lessons-learned.md\`.

## Login Posture

${authBehavior}

## Notes

- Prefer the generated manifest over guessed names.
${databaseNotes}
${authNotes}
- Prefer the existing GitHub Actions workflow over inventing a second deployment path.
- Keep operator-facing updates concise and actionable.
`;
}

export async function buildSourceSnapshot(
  input: CreateAppRequestInput,
): Promise<Record<string, string>> {
  const tokens = buildTokenMap(input);
  const manifest = await loadTemplateManifest(input.templateSlug);
  assertTemplateManifestMatchesCatalog(input.templateSlug, manifest);
  const generatedTemplateFiles = buildGeneratedTemplateFiles(input);
  const templateRoot = path.join(
    process.cwd(),
    "templates",
    input.templateSlug,
    "files",
  );
  const files: Record<string, string> = {};

  for (const entryFile of manifest.entryFiles) {
    const sourcePath = path.join(templateRoot, entryFile);
    const source = await readFile(sourcePath, "utf8");
    files[stripTemplateExtension(entryFile)] = renderTemplateString(
      source,
      tokens,
    );
  }

  for (const filePath of [
    ...manifest.generatedFiles,
    ...(manifest.generatedOverrides ?? []),
  ]) {
    const content = generatedTemplateFiles[filePath];

    if (content === undefined) {
      throw new Error(
        `Missing generated archive content for "${filePath}" in template "${input.templateSlug}".`,
      );
    }

    files[filePath] = content;
  }

  return files;
}

function formatList(values: string[]) {
  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}
