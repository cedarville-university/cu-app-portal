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
  conditionalEntryFiles?: {
    databasePostgresql?: string[];
    entraLogin?: string[];
  };
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
    "package.json": buildPackageJsonFile(input),
    ".env.example": buildEnvExampleFile(input),
    "src/app/page.tsx": buildPageFile(input),
    "src/lib/app-data.ts": buildAppDataFile(input),
    "README.md": buildReadmeFile(input),
    ".codex/skills/publish-to-azure/SKILL.md": buildPublishSkillFile(input),
    "app-portal/deployment-manifest.json": deploymentManifest,
  };
}

function buildPackageJsonFile(input: CreateAppRequestInput) {
  const hasDatabase = input.databaseProvider === "postgresql";
  const hasEntraLogin = input.entraLogin;
  const scripts = {
    ...(hasDatabase ? { predev: "prisma generate" } : {}),
    dev: "next dev",
    ...(hasDatabase ? { prebuild: "prisma generate" } : {}),
    build: "next build",
    start: hasDatabase ? "prisma migrate deploy && next start" : "next start",
    ...(hasDatabase
      ? {
          "db:generate": "prisma generate",
          "db:deploy": "prisma migrate deploy",
          pretypecheck: "prisma generate",
        }
      : {}),
    typecheck: "tsc --noEmit",
    test: "npm run typecheck",
  };
  const dependencies = {
    ...(hasDatabase ? { "@prisma/client": "^6.19.3" } : {}),
    next: "15.5.19",
    ...(hasEntraLogin ? { "next-auth": "^5.0.0-beta.25" } : {}),
    ...(hasDatabase ? { prisma: "^6.19.3" } : {}),
    react: "19.0.0",
    "react-dom": "19.0.0",
  };

  return `${JSON.stringify(
    {
      name: toSlug(input.appName),
      version: "0.1.0",
      private: true,
      scripts,
      dependencies,
      devDependencies: {
        "@types/node": "22.10.2",
        "@types/react": "19.0.2",
        "@types/react-dom": "19.0.2",
        typescript: "5.7.2",
      },
      engines: {
        node: ">=24",
      },
    },
    null,
    2,
  )}\n`;
}

function buildEnvExampleFile(input: CreateAppRequestInput) {
  const hasDatabase = input.databaseProvider === "postgresql";
  const hasEntraLogin = input.entraLogin;
  const lines = [
    ...(hasDatabase
      ? [
          `DATABASE_URL=postgresql://portal:portal@localhost:5432/${toSlug(
            input.appName,
          )}?schema=public`,
        ]
      : []),
    ...(hasEntraLogin
      ? [
          "AUTH_URL=http://localhost:3000",
          "NEXTAUTH_URL=http://localhost:3000",
          "AUTH_SECRET=replace-me",
          "AUTH_MICROSOFT_ENTRA_ID_ID=replace-me",
          "AUTH_MICROSOFT_ENTRA_ID_SECRET=replace-me",
          "AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/replace-me/v2.0",
        ]
      : []),
  ];

  if (lines.length === 0) {
    return "# This starter does not require local environment variables by default.\n";
  }

  return `${lines.join("\n")}\n`;
}

function buildPageFile(input: CreateAppRequestInput) {
  const hasDatabase = input.databaseProvider === "postgresql";
  const hasEntraLogin = input.entraLogin;
  const imports = [
    ...(hasEntraLogin
      ? ['import { auth, signIn, signOut } from "@/auth";']
      : []),
    ...(hasDatabase
      ? ['import { getAppDataStatus } from "@/lib/app-data";']
      : []),
  ];
  const authActions = hasEntraLogin
    ? `
async function signInAction() {
  "use server";

  await signIn("microsoft-entra-id");
}

async function signOutAction() {
  "use server";

  await signOut();
}
`
    : "";
  const dataLoad = hasDatabase
    ? hasEntraLogin
      ? `  const [session, dataStatus] = await Promise.all([
    auth(),
    getAppDataStatus(),
  ]);
`
      : `  const dataStatus = await getAppDataStatus();
`
    : hasEntraLogin
      ? `  const session = await auth();
`
      : "";
  const userName = hasEntraLogin
    ? `  const userName =
    session?.user?.name ?? session?.user?.email ?? "Cedarville user";
`
    : "";
  const authPanel = hasEntraLogin
    ? `        <div>
          <p className="panel-label">Authentication</p>
          {session?.user ? (
            <p className="panel-value">Signed in as {userName}</p>
          ) : (
            <p className="panel-value">Ready for Cedarville Entra sign-in</p>
          )}
        </div>
`
    : "";
  const dataPanel = hasDatabase
    ? `        <div>
          <p className="panel-label">{dataStatus.label}</p>
          <p className="panel-value">{dataStatus.value}</p>
        </div>
`
    : `        <div>
          <p className="panel-label">Starter status</p>
          <p className="panel-value">Ready to customize</p>
        </div>
`;
  const authButton = hasEntraLogin
    ? `        {session?.user ? (
          <form action={signOutAction}>
            <button type="submit">Sign out</button>
          </form>
        ) : (
          <form action={signInAction}>
            <button type="submit">Sign in with Cedarville</button>
          </form>
        )}
`
    : "";
  const prelude = [imports.join("\n"), authActions.trim()]
    .filter(Boolean)
    .join("\n\n");
  const leadingContent = prelude ? `${prelude}\n\n` : "";

  return `${leadingContent}export default async function HomePage() {
${dataLoad}${userName}
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Cedarville App Portal starter</p>
        <h1>{ ${JSON.stringify(input.appName)} }</h1>
        <p className="lede">{ ${JSON.stringify(input.description)} }</p>
        <p className="deployment-note">Prepared for ${input.hostingTarget}.</p>
      </section>

      <section className="status-panel" aria-label="Application status">
${authPanel}${dataPanel}${authButton}      </section>
    </main>
  );
}
`;
}

function buildAppDataFile(input: CreateAppRequestInput) {
  if (input.databaseProvider !== "postgresql") {
    return `export async function getAppDataStatus() {
  return {
    label: "App data",
    value: "No database configured",
  };
}
`;
  }

  return `import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function getAppDataStatus() {
  try {
    await prisma.appSetting.upsert({
      where: { key: "starter.dataStatus" },
      update: { value: "Ready for app data" },
      create: {
        key: "starter.dataStatus",
        value: "Ready for app data",
      },
    });

    return {
      label: "App data",
      value: "Ready for app data",
    };
  } catch {
    return {
      label: "App data",
      value: "Ready after publish",
    };
  }
}
`;
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

function getEntryFilesForInput(
  manifest: TemplateManifest,
  input: CreateAppRequestInput,
) {
  const entryFiles = [...manifest.entryFiles];

  if (input.databaseProvider === "postgresql") {
    entryFiles.push(
      ...(manifest.conditionalEntryFiles?.databasePostgresql ?? []),
    );
  }

  if (input.entraLogin) {
    entryFiles.push(...(manifest.conditionalEntryFiles?.entraLogin ?? []));
  }

  return entryFiles;
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

  for (const entryFile of getEntryFilesForInput(manifest, input)) {
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

function toSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return slug || "app";
}
