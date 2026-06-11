export type RepositoryFileMap = Record<string, string>;

export type ImportedAppRuntime =
  | {
      family: "node";
      framework: "nextjs";
      displayName: "Node.js 24 / Next.js";
      azureRuntimeStack: "NODE|24-lts";
      startupCommand: "npm start";
      workflowFileName: "deploy-azure-app-service.yml";
    }
  | {
      family: "python";
      framework: "fastapi";
      displayName: "Python 3.14 / FastAPI";
      azureRuntimeStack: "PYTHON|3.14";
      startupCommand: string;
      workflowFileName: "deploy-azure-app-service.yml";
    };

export const IMPORTED_NEXT_RUNTIME = {
  family: "node",
  framework: "nextjs",
  displayName: "Node.js 24 / Next.js",
  azureRuntimeStack: "NODE|24-lts",
  startupCommand: "npm start",
  workflowFileName: "deploy-azure-app-service.yml",
} as const satisfies ImportedAppRuntime;

export type CompatibilityFinding = {
  code:
    | "MISSING_PACKAGE_JSON"
    | "INVALID_PACKAGE_JSON"
    | "MISSING_BUILD_SCRIPT"
    | "MISSING_START_SCRIPT"
    | "MISSING_NODE_ENGINE"
    | "UNSUPPORTED_LOCKFILE"
    | "UNSUPPORTED_APP_SHAPE"
    | "MISSING_FASTAPI_ENTRYPOINT"
    | "MISSING_FASTAPI_SERVER_DEPENDENCY"
    | "AMBIGUOUS_APP_RUNTIME"
    | "UNSUPPORTED_APP_RUNTIME"
    | "UNSUPPORTED_WORKSPACE_ROOT"
    | "FILE_CONFLICT";
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
};

export type CompatibilityStatus =
  | "COMPATIBLE"
  | "NEEDS_ADDITIONS"
  | "UNSUPPORTED"
  | "CONFLICTED";

export type CompatibilityResult = {
  status: CompatibilityStatus;
  findings: CompatibilityFinding[];
  canDirectCommit: boolean;
  runtime: ImportedAppRuntime | null;
};

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  workspaces?: unknown;
};

export const PUBLISHING_BUNDLE_PATHS = [
  ".github/workflows/deploy-azure-app-service.yml",
  ".codex/skills/publish-to-azure/SKILL.md",
  "docs/publishing/azure-app-service.md",
  "docs/publishing/lessons-learned.md",
  "app-portal/deployment-manifest.json",
] as const;

function importedFastApiRuntime(moduleName: "main" | "app") {
  return {
    family: "python",
    framework: "fastapi",
    displayName: "Python 3.14 / FastAPI",
    azureRuntimeStack: "PYTHON|3.14",
    startupCommand: `python -m gunicorn ${moduleName}:app -k uvicorn.workers.UvicornWorker`,
    workflowFileName: "deploy-azure-app-service.yml",
  } as const satisfies ImportedAppRuntime;
}

function parsePackageJson(files: RepositoryFileMap) {
  if (!hasFile(files, "package.json")) {
    return {
      packageJson: null,
      finding: null,
    };
  }

  const rawPackageJson = files["package.json"];

  try {
    const parsedPackageJson = JSON.parse(rawPackageJson) as unknown;

    if (!isJsonObject(parsedPackageJson)) {
      return {
        packageJson: null,
        finding: {
          code: "INVALID_PACKAGE_JSON" as const,
          severity: "error" as const,
          message: "package.json must be a JSON object.",
          path: "package.json",
        },
      };
    }

    return {
      packageJson: parsedPackageJson as PackageJson,
      finding: null,
    };
  } catch {
    return {
      packageJson: null,
      finding: {
        code: "INVALID_PACKAGE_JSON" as const,
        severity: "error" as const,
        message: "package.json must be valid JSON.",
        path: "package.json",
      },
    };
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNextDependency(packageJson: PackageJson) {
  return Boolean(packageJson.dependencies?.next ?? packageJson.devDependencies?.next);
}

function parsePythonDependencyName(rawDependency: string) {
  const withoutInlineComment = rawDependency.split("#", 1)[0]?.trim() ?? "";
  const match = withoutInlineComment.match(
    /^([a-z0-9][a-z0-9_.-]*)(?:\s*(?:\[|===|==|~=|!=|<=|>=|<|>|;|,|\s|$))/i,
  );

  return match?.[1].toLowerCase() ?? null;
}

function collectPythonDependencies(files: RepositoryFileMap) {
  const dependencies = new Set<string>();

  for (const line of (files["requirements.txt"] ?? "").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) {
      continue;
    }

    const name = parsePythonDependencyName(line);

    if (name) {
      dependencies.add(name);
    }
  }

  let isInDependencyList = false;
  let isInPoetryDependencyTable = false;
  let currentTable: string | null = null;

  for (const line of (files["pyproject.toml"] ?? "").split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("#")) {
      continue;
    }

    const tableMatch = trimmedLine.match(/^\[([^\]]+)]$/);

    if (tableMatch) {
      currentTable = tableMatch[1].trim();
      isInDependencyList = false;
      isInPoetryDependencyTable = currentTable === "tool.poetry.dependencies";
      continue;
    }

    if (isInPoetryDependencyTable) {
      const assignmentMatch = trimmedLine.match(
        /^([a-z0-9][a-z0-9_.-]*)\s*=/i,
      );

      if (assignmentMatch) {
        dependencies.add(assignmentMatch[1].toLowerCase());
      }

      continue;
    }

    const startsDependencyList = /^dependencies\s*=/.test(trimmedLine);

    if (
      currentTable !== "project" ||
      (!startsDependencyList && !isInDependencyList)
    ) {
      continue;
    }

    for (const match of trimmedLine.matchAll(/["']([^"']+)["']/g)) {
      const name = parsePythonDependencyName(match[1]);

      if (name) {
        dependencies.add(name);
      }
    }

    const structureLine = trimmedLine.replaceAll(/["'][^"']*["']/g, "\"\"");

    if (startsDependencyList) {
      isInDependencyList =
        structureLine.includes("[") && !structureLine.includes("]");
    } else if (structureLine.includes("]")) {
      isInDependencyList = false;
    }
  }

  return dependencies;
}

function hasFastApiDependency(files: RepositoryFileMap) {
  return collectPythonDependencies(files).has("fastapi");
}

function hasFastApiServerDependencies(files: RepositoryFileMap) {
  const dependencies = collectPythonDependencies(files);

  return dependencies.has("gunicorn") && dependencies.has("uvicorn");
}

function detectFastApiEntrypoint(files: RepositoryFileMap) {
  if (hasFile(files, "main.py")) return "main";
  if (hasFile(files, "app.py")) return "app";
  return null;
}

function hasUnsupportedLockfile(files: RepositoryFileMap) {
  return (
    hasFile(files, "pnpm-lock.yaml") ||
    hasFile(files, "yarn.lock") ||
    hasFile(files, "bun.lock") ||
    hasFile(files, "bun.lockb")
  );
}

function hasFile(files: RepositoryFileMap, path: string) {
  return Object.prototype.hasOwnProperty.call(files, path);
}

function getWorkspaceRootPath(
  files: RepositoryFileMap,
  packageJson: PackageJson | null,
) {
  if (packageJson && Object.prototype.hasOwnProperty.call(packageJson, "workspaces")) {
    return "package.json";
  }

  for (const path of ["pnpm-workspace.yaml", "turbo.json", "lerna.json", "nx.json"]) {
    if (hasFile(files, path)) {
      return path;
    }
  }

  return null;
}

export function scanRepositoryCompatibility(
  files: RepositoryFileMap,
): CompatibilityResult {
  const findings: CompatibilityFinding[] = [];
  const { packageJson, finding } = parsePackageJson(files);
  const hasNextRuntime = packageJson ? hasNextDependency(packageJson) : false;
  const hasFastApiRuntime = hasFastApiDependency(files);
  const isAmbiguousRuntime = hasNextRuntime && hasFastApiRuntime;
  const fastApiEntrypoint = hasFastApiRuntime
    ? detectFastApiEntrypoint(files)
    : null;
  const hasSupportedFastApiServer = hasFastApiRuntime
    ? hasFastApiServerDependencies(files)
    : false;
  const runtime =
    hasNextRuntime && !isAmbiguousRuntime
      ? IMPORTED_NEXT_RUNTIME
      : fastApiEntrypoint && hasSupportedFastApiServer && !isAmbiguousRuntime
        ? importedFastApiRuntime(fastApiEntrypoint)
        : null;

  const isClearlyFastApiRuntime =
    hasFastApiRuntime && hasSupportedFastApiServer && Boolean(fastApiEntrypoint);

  if (finding && !isClearlyFastApiRuntime) {
    findings.push(finding);
  }

  if (isAmbiguousRuntime) {
    findings.push({
      code: "AMBIGUOUS_APP_RUNTIME",
      severity: "error",
      message:
        "Repository matches multiple supported runtimes. Keep one root Next.js or FastAPI app for portal-managed Azure publishing.",
    });
  } else if (!hasNextRuntime && !hasFastApiRuntime) {
    findings.push({
      code: "UNSUPPORTED_APP_RUNTIME",
      severity: "error",
      message:
        "Repository must be a root Next.js or FastAPI app for portal-managed Azure publishing.",
    });
  }

  if (!isAmbiguousRuntime && hasFastApiRuntime && !fastApiEntrypoint) {
    findings.push({
      code: "MISSING_FASTAPI_ENTRYPOINT",
      severity: "error",
      message:
        "FastAPI imports must include a root main.py or app.py entrypoint.",
    });
  }

  if (!isAmbiguousRuntime && hasFastApiRuntime && !hasSupportedFastApiServer) {
    findings.push({
      code: "MISSING_FASTAPI_SERVER_DEPENDENCY",
      severity: "error",
      message:
        "FastAPI imports must include gunicorn and uvicorn dependencies for the portal-managed startup command.",
    });
  }

  if (packageJson && hasNextRuntime) {
    if (!packageJson.scripts?.build) {
      findings.push({
        code: "MISSING_BUILD_SCRIPT",
        severity: "error",
        message: "package.json must include a build script.",
        path: "package.json",
      });
    }

    if (!packageJson.scripts?.start) {
      findings.push({
        code: "MISSING_START_SCRIPT",
        severity: "warning",
        message:
          "package.json is missing a start script; the portal can add \"next start\".",
      });
    }

    if (!packageJson.engines?.node) {
      findings.push({
        code: "MISSING_NODE_ENGINE",
        severity: "warning",
        message:
          "package.json is missing engines.node; the portal can add \">=24\".",
      });
    }

  }

  if ((hasNextRuntime || isAmbiguousRuntime) && hasUnsupportedLockfile(files)) {
    findings.push({
      code: "UNSUPPORTED_LOCKFILE",
      severity: "error",
      message:
        "V1 supports npm package-lock.json or npm install fallback only.",
    });
  }

  const workspaceRootPath = getWorkspaceRootPath(files, packageJson);

  if (workspaceRootPath) {
    findings.push({
      code: "UNSUPPORTED_WORKSPACE_ROOT",
      severity: "error",
      message: "V1 supports single root Next.js or FastAPI apps, not workspace roots.",
      path: workspaceRootPath,
    });
  }

  for (const path of PUBLISHING_BUNDLE_PATHS) {
    if (hasFile(files, path)) {
      findings.push({
        code: "FILE_CONFLICT",
        severity: "error",
        message: `${path} already exists and will not be overwritten.`,
        path,
      });
    }
  }

  const hasConflicts = findings.some((item) => item.code === "FILE_CONFLICT");
  const hasErrors = findings.some((item) => item.severity === "error");
  const hasWarnings = findings.some((item) => item.severity === "warning");

  if (hasConflicts) {
    return { status: "CONFLICTED", findings, canDirectCommit: false, runtime };
  }

  if (hasErrors) {
    return { status: "UNSUPPORTED", findings, canDirectCommit: false, runtime };
  }

  if (hasWarnings) {
    return { status: "NEEDS_ADDITIONS", findings, canDirectCommit: true, runtime };
  }

  return { status: "COMPATIBLE", findings, canDirectCommit: true, runtime };
}
