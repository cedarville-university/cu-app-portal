import { buildDeploymentManifest } from "@/features/generation/deployment-manifest";
import {
  IMPORTED_NEXT_RUNTIME,
  PUBLISHING_BUNDLE_PATHS,
  type ImportedAppRuntime,
  type RepositoryFileMap,
} from "./compatibility";

type PublishingBundleInput = {
  appName: string;
  repositoryOwner: string;
  repositoryName: string;
  runtime: ImportedAppRuntime;
  files: RepositoryFileMap;
  allowPublishingPathConflicts?: boolean;
};

type PublishingBundlePlan = {
  filesToWrite: Record<string, string>;
};

const NEXT_DEPLOY_WORKFLOW = `name: Deploy to Azure App Service

on:
  workflow_dispatch:
  push:
    branches:
      - main

env:
  AZURE_WEBAPP_NAME: \${{ secrets.AZURE_WEBAPP_NAME }}
  DEPLOY_PACKAGE_PATH: release

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install dependencies
        run: |
          if [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi

      - name: Build application
        run: npm run build

      - name: Prepare deployment package
        run: |
          rm -rf "\${{ env.DEPLOY_PACKAGE_PATH }}"
          mkdir -p "\${{ env.DEPLOY_PACKAGE_PATH }}"
          cp -R .next "\${{ env.DEPLOY_PACKAGE_PATH }}/.next"
          cp -R node_modules "\${{ env.DEPLOY_PACKAGE_PATH }}/node_modules"
          cp package.json "\${{ env.DEPLOY_PACKAGE_PATH }}/"
          for file in package-lock.json next.config.js next.config.mjs next.config.ts next-env.d.ts prisma.config.ts; do
            if [ -f "$file" ]; then
              cp "$file" "\${{ env.DEPLOY_PACKAGE_PATH }}/"
            fi
          done
          for dir in public prisma; do
            if [ -d "$dir" ]; then
              cp -R "$dir" "\${{ env.DEPLOY_PACKAGE_PATH }}/$dir"
            fi
          done

      - name: Azure login
        uses: azure/login@v2
        with:
          client-id: \${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: \${{ secrets.AZURE_TENANT_ID }}
          subscription-id: \${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: \${{ env.AZURE_WEBAPP_NAME }}
          package: \${{ env.DEPLOY_PACKAGE_PATH }}
`;

const HTTP_SERVER_START = `from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path


port = int(os.environ.get("PORT", "8000"))
repository_root = Path(__file__).resolve().parents[1]
handler = partial(SimpleHTTPRequestHandler, directory=str(repository_root))

with ThreadingHTTPServer(("0.0.0.0", port), handler) as server:
    server.serve_forever()
`;

function usesNextPublishingDefaults(runtime: ImportedAppRuntime) {
  return runtime.framework === IMPORTED_NEXT_RUNTIME.framework;
}

function buildDeployWorkflow(runtime: ImportedAppRuntime) {
  if (runtime.framework === "http-server") {
    return `name: Deploy to Azure App Service

on:
  workflow_dispatch:
  push:
    branches:
      - main

env:
  AZURE_WEBAPP_NAME: \${{ secrets.AZURE_WEBAPP_NAME }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.14"

      - name: Azure login
        uses: azure/login@v2
        with:
          client-id: \${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: \${{ secrets.AZURE_TENANT_ID }}
          subscription-id: \${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: \${{ env.AZURE_WEBAPP_NAME }}
          package: .
`;
  }

  if (runtime.framework === "fastapi") {
    return `name: Deploy to Azure App Service

on:
  workflow_dispatch:
  push:
    branches:
      - main

env:
  AZURE_WEBAPP_NAME: \${{ secrets.AZURE_WEBAPP_NAME }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.14"

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          if [ -f requirements.txt ]; then
            python -m pip install -r requirements.txt --target=".python_packages/lib/site-packages"
          elif [ -f pyproject.toml ]; then
            python - <<'PY'
          import sys
          import tomllib
          from pathlib import Path

          pyproject = tomllib.loads(Path("pyproject.toml").read_text())
          requirements = []
          version_prefixes = ("==", "!=", "~=", "<=", ">=", "<", ">", "===")

          def add_requirement(value):
              if isinstance(value, str) and value.strip():
                  requirements.append(value.strip())

          def format_poetry_requirement(name, spec):
              base_name = name

              if isinstance(spec, dict):
                  extras = spec.get("extras", [])
                  if isinstance(extras, list) and extras:
                      extras_suffix = ",".join(str(extra) for extra in extras)
                      base_name = f"{name}[{extras_suffix}]"
                  spec = spec.get("version", "")

              if isinstance(spec, str):
                  specifier = spec.strip()
                  if not specifier or specifier == "*":
                      return base_name
                  if specifier.startswith(version_prefixes):
                      return f"{base_name}{specifier}"

              return base_name

          for dependency in pyproject.get("project", {}).get("dependencies", []):
              add_requirement(dependency)

          poetry_dependencies = (
              pyproject.get("tool", {}).get("poetry", {}).get("dependencies", {})
          )
          for name, spec in poetry_dependencies.items():
              normalized_name = str(name).strip()
              if not normalized_name or normalized_name.lower() == "python":
                  continue

              if isinstance(spec, list):
                  for item in spec:
                      add_requirement(format_poetry_requirement(normalized_name, item))
              else:
                  add_requirement(format_poetry_requirement(normalized_name, spec))

          unique_requirements = list(dict.fromkeys(requirements))
          if not unique_requirements:
              sys.exit("No installable dependencies found in pyproject.toml.")

          Path("pyproject-requirements.txt").write_text(
              "\\n".join(unique_requirements) + "\\n",
          )
          PY
            python -m pip install -r pyproject-requirements.txt --target=".python_packages/lib/site-packages"
          else
            echo "Expected requirements.txt or pyproject.toml for FastAPI dependency installation."
            exit 1
          fi

      - name: Azure login
        uses: azure/login@v2
        with:
          client-id: \${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: \${{ secrets.AZURE_TENANT_ID }}
          subscription-id: \${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: \${{ env.AZURE_WEBAPP_NAME }}
          package: .
`;
  }

  return NEXT_DEPLOY_WORKFLOW;
}

function buildImportedManifest(
  appName: string,
  repositoryName: string,
  runtime: ImportedAppRuntime,
) {
  const hasNextDefaults = usesNextPublishingDefaults(runtime);
  const manifest = buildDeploymentManifest(
    {
      templateSlug: "imported-web-app",
      appName,
      description: `Imported app ${appName}`,
      hostingTarget: "Azure App Service",
      databaseProvider: hasNextDefaults ? "postgresql" : "none",
      entraLogin: hasNextDefaults,
    },
    { runtime },
  );

  return `${JSON.stringify(
    {
      ...manifest,
      templateSlug: "imported-web-app",
      defaults: {
        ...manifest.defaults,
        githubRepository: repositoryName,
      },
    },
    null,
    2,
  )}\n`;
}

function updatePackageJson(rawPackageJson: string) {
  const parsed = JSON.parse(rawPackageJson) as {
    scripts?: Record<string, string>;
    engines?: Record<string, string>;
    [key: string]: unknown;
  };
  let changed = false;

  if (!parsed.scripts?.start) {
    parsed.scripts = { ...parsed.scripts, start: "next start" };
    changed = true;
  }

  if (!parsed.engines?.node) {
    parsed.engines = { ...parsed.engines, node: ">=24" };
    changed = true;
  }

  return changed ? `${JSON.stringify(parsed, null, 2)}\n` : null;
}

function assertNoPublishingPathConflicts(files: RepositoryFileMap) {
  for (const path of PUBLISHING_BUNDLE_PATHS) {
    if (Object.prototype.hasOwnProperty.call(files, path)) {
      throw new Error(`${path} already exists and will not be overwritten.`);
    }
  }
}

export function planPublishingBundle({
  appName,
  repositoryName,
  runtime,
  files,
  allowPublishingPathConflicts = false,
}: PublishingBundleInput): PublishingBundlePlan {
  if (!allowPublishingPathConflicts) {
    assertNoPublishingPathConflicts(files);
  }

  const filesToWrite: Record<string, string> = {};
  const updatedPackageJson =
    usesNextPublishingDefaults(runtime)
      ? updatePackageJson(files["package.json"])
      : null;

  if (updatedPackageJson) {
    filesToWrite["package.json"] = updatedPackageJson;
  }

  filesToWrite[".github/workflows/deploy-azure-app-service.yml"] =
    buildDeployWorkflow(runtime);
  if (runtime.framework === "http-server") {
    filesToWrite["app-portal/http_server_start.py"] = HTTP_SERVER_START;
  }
  filesToWrite[".codex/skills/publish-to-azure/SKILL.md"] =
    `# Publish to Azure\n\nUse the Cedarville App Portal as the supported Azure publishing path for this imported ${runtime.displayName} app.\n`;
  filesToWrite["docs/publishing/azure-app-service.md"] =
    `# Publish to Azure App Service\n\nThis imported ${runtime.displayName} app is prepared for Cedarville App Portal-managed Azure publishing.\n`;
  filesToWrite["docs/publishing/lessons-learned.md"] =
    "# Publishing Lessons Learned\n\nRecord manual fixes and deployment blockers here.\n";
  filesToWrite["app-portal/deployment-manifest.json"] = buildImportedManifest(
    appName,
    repositoryName,
    runtime,
  );

  return { filesToWrite };
}
