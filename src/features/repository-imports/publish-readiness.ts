import {
  PUBLISHING_BUNDLE_PATHS,
  scanRepositoryCompatibility,
  type ImportedAppRuntime,
  type RepositoryFileMap,
} from "./compatibility";

type GitHubReadinessClient = {
  readRepositoryTextFiles(input: {
    owner: string;
    name: string;
    ref: string;
    paths: string[];
  }): Promise<Record<string, string>>;
};

type VerifyImportedPublishReadinessInput = {
  owner: string;
  name: string;
  defaultBranch: string;
  github: GitHubReadinessClient;
};

const READINESS_PATHS = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "pnpm-workspace.yaml",
  "turbo.json",
  "lerna.json",
  "nx.json",
  "requirements.txt",
  "pyproject.toml",
  "main.py",
  "app.py",
  ...PUBLISHING_BUNDLE_PATHS,
];
const REQUIRED_READINESS_PATHS = [...PUBLISHING_BUNDLE_PATHS];

function removePublishingBundlePaths(files: RepositoryFileMap) {
  const compatibilityFiles = { ...files };

  for (const path of PUBLISHING_BUNDLE_PATHS) {
    delete compatibilityFiles[path];
  }

  return compatibilityFiles;
}

function formatFinding({
  path,
  message,
}: {
  path?: string;
  message: string;
}) {
  return path ? `${path}: ${message}` : message;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isManifestRuntime(value: unknown): value is ImportedAppRuntime {
  if (!isJsonObject(value)) {
    return false;
  }

  if (value.family === "node" && value.framework === "nextjs") {
    return (
      value.displayName === "Node.js 24 / Next.js" &&
      value.azureRuntimeStack === "NODE|24-lts" &&
      value.startupCommand === "npm start" &&
      value.workflowFileName === "deploy-azure-app-service.yml"
    );
  }

  return (
    value.family === "python" &&
    value.framework === "fastapi" &&
    value.displayName === "Python 3.14 / FastAPI" &&
    value.azureRuntimeStack === "PYTHON|3.14" &&
    typeof value.startupCommand === "string" &&
    value.workflowFileName === "deploy-azure-app-service.yml"
  );
}

function parseManifestRuntime(files: RepositoryFileMap) {
  const rawManifest = files["app-portal/deployment-manifest.json"];

  if (!rawManifest) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawManifest) as { runtime?: unknown };

    return isManifestRuntime(parsed.runtime) ? parsed.runtime : null;
  } catch {
    return null;
  }
}

function getFeatureDefaults(runtime: ImportedAppRuntime | null) {
  const isNext = runtime?.framework === "nextjs";

  return {
    databaseProvider: isNext ? ("postgresql" as const) : ("none" as const),
    entraLogin: isNext,
  };
}

export async function verifyImportedPublishReadiness({
  owner,
  name,
  defaultBranch,
  github,
}: VerifyImportedPublishReadinessInput) {
  const files = await github.readRepositoryTextFiles({
    owner,
    name,
    ref: defaultBranch,
    paths: READINESS_PATHS,
  });
  const missingPaths = REQUIRED_READINESS_PATHS.filter(
    (path) => !Object.prototype.hasOwnProperty.call(files, path),
  );
  const compatibility = scanRepositoryCompatibility(
    removePublishingBundlePaths(files),
  );
  const packageIssues = compatibility.findings
    .filter((finding) => finding.code !== "FILE_CONFLICT")
    .map(formatFinding);
  const runtime = compatibility.runtime ?? parseManifestRuntime(files);

  return {
    ready: missingPaths.length === 0 && packageIssues.length === 0,
    missingPaths,
    packageIssues,
    runtime,
    ...getFeatureDefaults(runtime),
  };
}
