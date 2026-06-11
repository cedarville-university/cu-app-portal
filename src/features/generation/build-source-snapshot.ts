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
  const publishResourcesText =
    input.databaseProvider === "postgresql"
      ? "Let the portal provision Azure PostgreSQL, App Service settings, and production auth settings during publish."
      : "Let the portal provision App Service settings during publish.";
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

  for (const filePath of manifest.generatedFiles) {
    const content = generatedTemplateFiles[filePath];

    if (content === undefined) {
      throw new Error(
        `Missing generated archive content for "${filePath}" in template "${input.templateSlug}".`,
      );
    }

    files[filePath] = content;
  }

  // Generated files intentionally override rendered entries so feature-aware docs win path collisions.
  for (const [filePath, content] of Object.entries(generatedTemplateFiles)) {
    files[filePath] = content;
  }

  return files;
}
