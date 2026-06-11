# Imported App Runtime Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand imported app support so compatible GitHub repositories can be prepared for Azure App Service as either Next.js or Python FastAPI apps.

**Architecture:** Add a small imported-runtime detector in repository import compatibility code, then pass that runtime through preparation, publishing bundle generation, submitted app config, and Azure publish/setup runtime resolution. Keep the synthetic `imported-web-app` template for imported records, with legacy imported apps falling back to the existing Next.js behavior when no runtime metadata exists.

**Tech Stack:** Next.js App Router server actions, TypeScript, Prisma JSON config, Vitest, GitHub App repository preparation, Azure App Service deployment manifests and workflows.

---

## File Map

- Modify `src/features/repository-imports/compatibility.ts`: define imported runtime metadata, detect Next.js/FastAPI, return `runtime` on compatibility results, and emit runtime-specific findings.
- Modify `src/features/repository-imports/compatibility.test.ts`: cover Next.js, FastAPI from `requirements.txt`, FastAPI from `pyproject.toml`, ambiguous repos, unsupported repos, and conflict precedence.
- Modify `src/features/repository-imports/publishing-bundle.ts`: accept an import runtime, generate runtime-specific workflow, manifest, docs, publish skill, and package changes.
- Modify `src/features/repository-imports/publishing-bundle.test.ts`: verify Next.js parity and FastAPI bundle contents.
- Modify `src/features/repository-imports/prepare-repository.ts`: read FastAPI files, use the detected runtime, pass it to the bundle planner, and keep error text runtime-aware.
- Modify `src/features/repository-imports/prepare-repository.test.ts`: verify FastAPI preparation direct commit/PR and unsupported findings.
- Modify `src/features/repository-imports/publish-readiness.ts`: verify runtime-specific readiness after a publishing PR is merged and return verified runtime metadata.
- Modify `src/features/repository-imports/publish-readiness.test.ts`: cover FastAPI readiness without `package.json` and manifest/runtime metadata extraction.
- Modify `src/features/repository-imports/actions.ts`: store import runtime, `templateSlug`, `databaseProvider`, and `entraLogin` in submitted config after add/import and local repo creation.
- Modify `src/features/repository-imports/actions.test.ts`: verify submitted config for existing imports and local managed repos.
- Modify `src/features/publishing/azure/runtime.ts`: resolve imported runtime/features from `submittedConfig` before legacy fallback.
- Modify `src/features/publishing/azure/runtime.test.ts`: verify imported FastAPI provisioning uses Python runtime, skips database, and skips Entra.
- Modify `src/features/publishing/setup/service.ts`: resolve imported runtime/features from `submittedConfig` before legacy fallback for preflight and repair.
- Modify `src/features/publishing/setup/service.test.ts`: verify imported FastAPI repair/preflight runtime and feature behavior.
- Modify `src/app/apps/add/page.tsx` and `src/app/apps/add/page.test.tsx`: tell users the import path currently detects Next.js and Python FastAPI.
- Modify `README.md` and `docs/portal/setup.md`: update import support wording from Next-only to Next.js/FastAPI.

---

### Task 1: Detect Imported Runtime Compatibility

**Files:**
- Modify: `src/features/repository-imports/compatibility.ts`
- Test: `src/features/repository-imports/compatibility.test.ts`

- [ ] **Step 1: Write failing tests for FastAPI and ambiguous runtime detection**

Add tests like these to `src/features/repository-imports/compatibility.test.ts`:

```ts
it("accepts a root FastAPI app with requirements.txt and main.py", () => {
  expect(
    scanRepositoryCompatibility({
      "requirements.txt": "fastapi==0.115.0\nuvicorn[standard]==0.30.0\n",
      "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    }),
  ).toEqual({
    status: "COMPATIBLE",
    findings: [],
    canDirectCommit: true,
    runtime: expect.objectContaining({
      family: "python",
      framework: "fastapi",
      azureRuntimeStack: "PYTHON|3.14",
      startupCommand:
        "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
    }),
  });
});

it("accepts a root FastAPI app with pyproject.toml and app.py", () => {
  expect(
    scanRepositoryCompatibility({
      "pyproject.toml": '[project]\ndependencies = ["fastapi>=0.115"]\n',
      "app.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    }).runtime,
  ).toMatchObject({
    family: "python",
    framework: "fastapi",
    startupCommand:
      "python -m gunicorn app:app -k uvicorn.workers.UvicornWorker",
  });
});

it("rejects ambiguous Next.js and FastAPI repositories", () => {
  const result = scanRepositoryCompatibility({
    "package.json": JSON.stringify({
      scripts: { build: "next build", start: "next start" },
      dependencies: { next: "15.5.15" },
      engines: { node: ">=24" },
    }),
    "requirements.txt": "fastapi==0.115.0\n",
    "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
  });

  expect(result.status).toBe("UNSUPPORTED");
  expect(result.findings).toContainEqual({
    code: "AMBIGUOUS_APP_RUNTIME",
    severity: "error",
    message:
      "Repository matches multiple supported runtimes. Keep one root Next.js or FastAPI app for portal-managed Azure publishing.",
  });
});
```

- [ ] **Step 2: Run compatibility tests to verify they fail**

Run:

```bash
npm test -- src/features/repository-imports/compatibility.test.ts
```

Expected: FAIL because `runtime` is not returned and `AMBIGUOUS_APP_RUNTIME` is not defined.

- [ ] **Step 3: Implement runtime metadata and detection**

In `compatibility.ts`, add runtime types and constants:

```ts
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
```

Extend `CompatibilityFinding["code"]` with:

```ts
| "MISSING_FASTAPI_ENTRYPOINT"
| "AMBIGUOUS_APP_RUNTIME"
| "UNSUPPORTED_APP_RUNTIME"
```

Extend `CompatibilityResult`:

```ts
runtime: ImportedAppRuntime | null;
```

Add helpers:

```ts
function hasFastApiDependency(files: RepositoryFileMap) {
  return /\bfastapi\b/i.test(files["requirements.txt"] ?? "") ||
    /\bfastapi\b/i.test(files["pyproject.toml"] ?? "");
}

function detectFastApiEntrypoint(files: RepositoryFileMap) {
  if (hasFile(files, "main.py")) return "main";
  if (hasFile(files, "app.py")) return "app";
  return null;
}
```

Change `scanRepositoryCompatibility` so:

- Next.js is detected with the existing `hasNextDependency(packageJson)`.
- FastAPI is detected with `hasFastApiDependency(files)`.
- Both detected means unsupported with `AMBIGUOUS_APP_RUNTIME`.
- FastAPI without `main.py` or `app.py` means unsupported with `MISSING_FASTAPI_ENTRYPOINT`.
- Neither detected means unsupported with `UNSUPPORTED_APP_RUNTIME`.
- Node package checks only run for Next.js-shaped repos.
- Unsupported Node lockfile checks only block Next.js-shaped repos or ambiguous repos.
- Workspace-root checks still block all detected runtimes.

- [ ] **Step 4: Run compatibility tests to verify green**

Run:

```bash
npm test -- src/features/repository-imports/compatibility.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/features/repository-imports/compatibility.ts src/features/repository-imports/compatibility.test.ts
git commit -m "feat: detect imported app runtimes"
```

---

### Task 2: Generate Runtime-Specific Publishing Bundles

**Files:**
- Modify: `src/features/repository-imports/publishing-bundle.ts`
- Test: `src/features/repository-imports/publishing-bundle.test.ts`

- [ ] **Step 1: Write failing bundle tests**

Add a FastAPI case:

```ts
it("adds FastAPI publishing files without package.json rewrites", () => {
  const plan = planPublishingBundle({
    appName: "Reports API",
    repositoryOwner: "cedarville-it",
    repositoryName: "reports-api",
    runtime: {
      family: "python",
      framework: "fastapi",
      displayName: "Python 3.14 / FastAPI",
      azureRuntimeStack: "PYTHON|3.14",
      startupCommand:
        "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
      workflowFileName: "deploy-azure-app-service.yml",
    },
    files: {
      "requirements.txt": "fastapi==0.115.0\nuvicorn[standard]==0.30.0\n",
      "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    },
  });

  expect(plan.filesToWrite["package.json"]).toBeUndefined();
  expect(
    plan.filesToWrite[".github/workflows/deploy-azure-app-service.yml"],
  ).toContain("Setup Python");
  expect(
    plan.filesToWrite[".github/workflows/deploy-azure-app-service.yml"],
  ).toContain(".python_packages/lib/site-packages");
  expect(
    JSON.parse(plan.filesToWrite["app-portal/deployment-manifest.json"]),
  ).toMatchObject({
    templateSlug: "imported-web-app",
    runtime: {
      family: "python",
      framework: "fastapi",
      azureRuntimeStack: "PYTHON|3.14",
    },
    defaults: {
      githubRepository: "reports-api",
      appSettings: expect.not.objectContaining({
        DATABASE_URL: expect.any(String),
        AUTH_SECRET: expect.any(String),
      }),
    },
  });
  expect(plan.filesToWrite["docs/publishing/azure-app-service.md"]).toContain(
    "Python 3.14 / FastAPI",
  );
});
```

Update the existing Next.js test to pass `runtime: IMPORTED_NEXT_RUNTIME` after exporting/importing the constant.

- [ ] **Step 2: Run bundle tests to verify failure**

Run:

```bash
npm test -- src/features/repository-imports/publishing-bundle.test.ts
```

Expected: FAIL because `runtime` is not accepted and FastAPI workflow generation does not exist.

- [ ] **Step 3: Implement runtime-specific bundle generation**

Import runtime types/constants:

```ts
import {
  IMPORTED_NEXT_RUNTIME,
  type ImportedAppRuntime,
} from "./compatibility";
```

Change input:

```ts
type PublishingBundleInput = {
  appName: string;
  repositoryOwner: string;
  repositoryName: string;
  runtime: ImportedAppRuntime;
  files: RepositoryFileMap;
  allowPublishingPathConflicts?: boolean;
};
```

Replace the single workflow constant with `buildDeployWorkflow(runtime)`:

```ts
function buildDeployWorkflow(runtime: ImportedAppRuntime) {
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
          python -m pip install -r requirements.txt --target=".python_packages/lib/site-packages"

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
```

Change manifest generation:

```ts
function buildImportedManifest(
  appName: string,
  repositoryName: string,
  runtime: ImportedAppRuntime,
) {
  const hasNextDefaults = runtime.framework === "nextjs";
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
```

Only call `updatePackageJson` for `runtime.framework === "nextjs"`.

Write runtime-aware docs:

```ts
filesToWrite[".codex/skills/publish-to-azure/SKILL.md"] =
  `# Publish to Azure\n\nUse the Cedarville App Portal as the supported Azure publishing path for this imported ${runtime.displayName} app.\n`;
filesToWrite["docs/publishing/azure-app-service.md"] =
  `# Publish to Azure App Service\n\nThis imported ${runtime.displayName} app is prepared for Cedarville App Portal-managed Azure publishing.\n`;
```

- [ ] **Step 4: Run bundle tests to verify green**

Run:

```bash
npm test -- src/features/repository-imports/publishing-bundle.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/features/repository-imports/publishing-bundle.ts src/features/repository-imports/publishing-bundle.test.ts
git commit -m "feat: generate imported runtime publishing bundles"
```

---

### Task 3: Thread Runtime Through Repository Preparation

**Files:**
- Modify: `src/features/repository-imports/prepare-repository.ts`
- Test: `src/features/repository-imports/prepare-repository.test.ts`

- [ ] **Step 1: Write failing preparation tests**

Add a FastAPI direct commit test:

```ts
it("commits FastAPI publishing additions directly", async () => {
  const github = {
    getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
    readRepositoryTextFiles: vi.fn().mockResolvedValue({
      "requirements.txt": "fastapi==0.115.0\nuvicorn[standard]==0.30.0\n",
      "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    }),
    commitFiles: vi.fn().mockResolvedValue({ commitSha: "commit-sha" }),
    createPullRequestWithFiles: vi.fn(),
  };

  await prepareImportedRepository({
    appName: "Reports API",
    owner: "cedarville-it",
    name: "reports-api",
    defaultBranch: "main",
    mode: "DIRECT_COMMIT",
    github,
  });

  expect(github.readRepositoryTextFiles).toHaveBeenCalledWith(
    expect.objectContaining({
      paths: expect.arrayContaining([
        "requirements.txt",
        "pyproject.toml",
        "main.py",
        "app.py",
      ]),
    }),
  );
  expect(github.commitFiles).toHaveBeenCalledWith(
    expect.objectContaining({
      files: expect.objectContaining({
        ".github/workflows/deploy-azure-app-service.yml":
          expect.stringContaining("Setup Python"),
      }),
    }),
  );
});
```

- [ ] **Step 2: Run preparation tests to verify failure**

Run:

```bash
npm test -- src/features/repository-imports/prepare-repository.test.ts
```

Expected: FAIL because FastAPI read paths are absent and runtime is not passed into `planPublishingBundle`.

- [ ] **Step 3: Add FastAPI read paths and pass detected runtime**

Update `READ_PATHS`:

```ts
const READ_PATHS = [
  "package.json",
  "package-lock.json",
  "requirements.txt",
  "pyproject.toml",
  "main.py",
  "app.py",
  ...
];
```

After scanning:

```ts
if (!compatibility.runtime) {
  throw new Error(
    formatCompatibilityError(
      "Repository is not compatible with v1 Azure publishing.",
      compatibility.findings,
    ),
  );
}
```

Pass runtime:

```ts
const plan = planPublishingBundle({
  appName,
  repositoryOwner: owner,
  repositoryName: name,
  runtime: compatibility.runtime,
  files,
  allowPublishingPathConflicts: mode === "PULL_REQUEST",
});
```

- [ ] **Step 4: Run preparation tests to verify green**

Run:

```bash
npm test -- src/features/repository-imports/prepare-repository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/features/repository-imports/prepare-repository.ts src/features/repository-imports/prepare-repository.test.ts
git commit -m "feat: prepare imported fastapi repositories"
```

---

### Task 4: Store Import Runtime Configuration

**Files:**
- Modify: `src/features/repository-imports/actions.ts`
- Test: `src/features/repository-imports/actions.test.ts`

- [ ] **Step 1: Write failing action tests for submitted config**

Update the shared-org app request test to assert default imported Next.js config:

```ts
expect(prisma.appRequest.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    submittedConfig: expect.objectContaining({
      templateSlug: "imported-web-app",
      databaseProvider: "postgresql",
      entraLogin: true,
      importRuntime: expect.objectContaining({
        family: "node",
        framework: "nextjs",
        azureRuntimeStack: "NODE|24-lts",
      }),
    }),
  }),
});
```

Add a local managed repository assertion with the same imported runtime defaults.

- [ ] **Step 2: Run action tests to verify failure**

Run:

```bash
npm test -- src/features/repository-imports/actions.test.ts
```

Expected: FAIL because submitted config lacks `templateSlug`, `databaseProvider`, `entraLogin`, and `importRuntime`.

- [ ] **Step 3: Add imported runtime defaults to action submitted config**

Import the default:

```ts
import { IMPORTED_NEXT_RUNTIME } from "./compatibility";
```

Add helper:

```ts
function buildImportedSubmittedConfig({
  repositoryUrl,
  description,
  localOnlySource = false,
}: {
  repositoryUrl: string;
  description: string;
  localOnlySource?: boolean;
}) {
  return {
    repositoryUrl,
    description,
    hostingTarget: "Azure App Service",
    templateSlug: "imported-web-app",
    importRuntime: IMPORTED_NEXT_RUNTIME,
    databaseProvider: "postgresql",
    entraLogin: true,
    ...(localOnlySource ? { localOnlySource: true } : {}),
  };
}
```

Use it in both `addExistingAppAction` and `createManagedRepositoryForLocalAppAction`. This task stores default Next.js metadata because the add step does not read repository contents. Later preparation scans the repository and refines the runtime after either a direct commit or a PR merge verification.

- [ ] **Step 4: Run action tests to verify green**

Run:

```bash
npm test -- src/features/repository-imports/actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/features/repository-imports/actions.ts src/features/repository-imports/actions.test.ts
git commit -m "feat: store imported runtime defaults"
```

---

### Task 5: Verify Runtime-Specific Publish Readiness

**Files:**
- Modify: `src/features/repository-imports/publish-readiness.ts`
- Test: `src/features/repository-imports/publish-readiness.test.ts`

- [ ] **Step 1: Write failing readiness tests for FastAPI**

Add a FastAPI-ready case:

```ts
it("verifies FastAPI publishing readiness without package.json", async () => {
  const manifest = JSON.stringify({
    templateSlug: "imported-web-app",
    runtime: {
      family: "python",
      framework: "fastapi",
      displayName: "Python 3.14 / FastAPI",
      azureRuntimeStack: "PYTHON|3.14",
      startupCommand:
        "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
      workflowFileName: "deploy-azure-app-service.yml",
    },
  });
  const github = {
    readRepositoryTextFiles: vi.fn().mockResolvedValue({
      "requirements.txt": "fastapi==0.115.0\n",
      "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      ...Object.fromEntries(
        PUBLISHING_BUNDLE_PATHS.map((path) => [
          path,
          path === "app-portal/deployment-manifest.json"
            ? manifest
            : "content",
        ]),
      ),
    }),
  };

  await expect(
    verifyImportedPublishReadiness({
      owner: "cedarville-it",
      name: "reports-api",
      defaultBranch: "main",
      github,
    }),
  ).resolves.toMatchObject({
    ready: true,
    missingPaths: [],
    packageIssues: [],
    runtime: {
      family: "python",
      framework: "fastapi",
      azureRuntimeStack: "PYTHON|3.14",
    },
    databaseProvider: "none",
    entraLogin: false,
  });
});
```

- [ ] **Step 2: Run readiness tests to verify failure**

Run:

```bash
npm test -- src/features/repository-imports/publish-readiness.test.ts
```

Expected: FAIL because `package.json` is required and readiness does not return runtime/default fields.

- [ ] **Step 3: Implement runtime-specific readiness**

Update `READINESS_PATHS` with FastAPI paths:

```ts
const READINESS_PATHS = [
  "package.json",
  "package-lock.json",
  "requirements.txt",
  "pyproject.toml",
  "main.py",
  "app.py",
  ...
];
```

Stop using a fixed `REQUIRED_READINESS_PATHS` that always includes `package.json`. Instead:

```ts
const requiredPublishingPaths = [...PUBLISHING_BUNDLE_PATHS];
const compatibility = scanRepositoryCompatibility(
  removePublishingBundlePaths(files),
);
const missingPaths = requiredPublishingPaths.filter(
  (path) => !Object.prototype.hasOwnProperty.call(files, path),
);
```

Parse `app-portal/deployment-manifest.json` only when present:

```ts
function parseManifestRuntime(files: RepositoryFileMap) {
  const rawManifest = files["app-portal/deployment-manifest.json"];

  if (!rawManifest) return null;

  try {
    const parsed = JSON.parse(rawManifest) as {
      runtime?: unknown;
      defaults?: { database?: unknown; auth?: unknown };
    };

    return parsed.runtime && typeof parsed.runtime === "object"
      ? parsed.runtime
      : null;
  } catch {
    return null;
  }
}
```

Return feature defaults from the verified compatibility runtime:

```ts
const runtime = compatibility.runtime ?? parseManifestRuntime(files);
const isNext = runtime && "framework" in runtime && runtime.framework === "nextjs";

return {
  ready: missingPaths.length === 0 && packageIssues.length === 0,
  missingPaths,
  packageIssues,
  runtime,
  databaseProvider: isNext ? "postgresql" : "none",
  entraLogin: Boolean(isNext),
};
```

- [ ] **Step 4: Run readiness tests to verify green**

Run:

```bash
npm test -- src/features/repository-imports/publish-readiness.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/features/repository-imports/publish-readiness.ts src/features/repository-imports/publish-readiness.test.ts
git commit -m "feat: verify imported runtime readiness"
```

---

### Task 6: Persist Detected Runtime After Preparation

**Files:**
- Modify: `src/features/repository-imports/prepare-repository.ts`
- Modify: `src/features/repository-imports/actions.ts`
- Test: `src/features/repository-imports/prepare-repository.test.ts`
- Test: `src/features/repository-imports/actions.test.ts`

- [ ] **Step 1: Write failing tests for returned preparation runtime**

In `prepare-repository.test.ts`, assert the result includes runtime and feature choices:

```ts
await expect(
  prepareImportedRepository({
    appName: "Reports API",
    owner: "cedarville-it",
    name: "reports-api",
    defaultBranch: "main",
    mode: "DIRECT_COMMIT",
    github,
  }),
).resolves.toMatchObject({
  status: "COMMITTED",
  runtime: {
    family: "python",
    framework: "fastapi",
  },
  databaseProvider: "none",
  entraLogin: false,
});
```

In `actions.test.ts`, add a `prepareExistingAppAction` test where `prepareImportedRepository` returns FastAPI runtime and assert `prisma.appRequest.update` merges it into `submittedConfig`. Add a second `verifyExistingAppPreparationAction` test that mocks FastAPI readiness metadata and asserts the same submitted-config merge happens after a PR is verified.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/features/repository-imports/prepare-repository.test.ts src/features/repository-imports/actions.test.ts
```

Expected: FAIL because preparation results do not expose runtime and actions do not update submitted config.

- [ ] **Step 3: Return detected runtime and update submitted config**

In `prepareImportedRepository`, return:

```ts
const featureDefaults =
  compatibility.runtime.framework === "nextjs"
    ? { databaseProvider: "postgresql" as const, entraLogin: true }
    : { databaseProvider: "none" as const, entraLogin: false };
```

Include the runtime and defaults in both success branches:

```ts
return {
  status: "COMMITTED" as const,
  commitSha: commit.commitSha,
  pullRequestUrl: null,
  runtime: compatibility.runtime,
  ...featureDefaults,
};
```

In `prepareExistingAppAction`, after successful preparation, update the app request:

```ts
await prisma.appRequest.update({
  where: { id: requestId },
  data: {
    submittedConfig: {
      ...(isJsonObject(appRequest.submittedConfig)
        ? appRequest.submittedConfig
        : {}),
      templateSlug: "imported-web-app",
      importRuntime: result.runtime,
      databaseProvider: result.databaseProvider,
      entraLogin: result.entraLogin,
    },
  },
});
```

Add local helper:

```ts
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

For `verifyExistingAppPreparationAction`, use the readiness result fields from Task 5. Merge the verified runtime/defaults into `submittedConfig` before running publishing setup preflight.

- [ ] **Step 4: Run tests to verify green**

Run:

```bash
npm test -- src/features/repository-imports/prepare-repository.test.ts src/features/repository-imports/actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/features/repository-imports/prepare-repository.ts src/features/repository-imports/prepare-repository.test.ts src/features/repository-imports/actions.ts src/features/repository-imports/actions.test.ts
git commit -m "feat: persist detected imported runtime"
```

---

### Task 7: Use Imported Runtime In Publish And Repair

**Files:**
- Modify: `src/features/publishing/azure/runtime.ts`
- Modify: `src/features/publishing/setup/service.ts`
- Test: `src/features/publishing/azure/runtime.test.ts`
- Test: `src/features/publishing/setup/service.test.ts`

- [ ] **Step 1: Write failing publishing/runtime tests**

In `runtime.test.ts`, add:

```ts
it("uses imported FastAPI runtime and skips database/auth provisioning", async () => {
  const { deps, arm, graph } = createDeps({
    appRequest: {
      ...readyImportedAppRequest,
      submittedConfig: {
        templateSlug: "imported-web-app",
        importRuntime: {
          family: "python",
          framework: "fastapi",
          displayName: "Python 3.14 / FastAPI",
          azureRuntimeStack: "PYTHON|3.14",
          startupCommand:
            "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
          workflowFileName: "deploy-azure-app-service.yml",
        },
        databaseProvider: "none",
        entraLogin: false,
      },
    },
  });
  const runtime = createAzurePublishRuntime(deps);

  const target = await runtime.provisionInfrastructure("clx9abc123zzzzzzzzzz");

  expect(target.azureDatabaseName).toBeNull();
  expect(arm.putPostgresDatabase).not.toHaveBeenCalled();
  expect(arm.putWebApp).toHaveBeenCalledWith(
    expect.objectContaining({
      runtimeStack: "PYTHON|3.14",
      startupCommand:
        "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
    }),
  );
  expect(graph.ensureRedirectUri).not.toHaveBeenCalled();
});
```

Add matching repair/preflight tests in `service.test.ts`.

- [ ] **Step 2: Run publish/setup tests to verify failure**

Run:

```bash
npm test -- src/features/publishing/azure/runtime.test.ts src/features/publishing/setup/service.test.ts
```

Expected: FAIL because imported apps ignore submitted runtime metadata and use legacy fallback.

- [ ] **Step 3: Implement submitted imported runtime parsing**

In both files, add helpers:

```ts
function importedRuntimeFromSubmittedConfig(
  appRequest: PublishableAppRequest | SetupAppRequest,
) {
  if (!isImportedAppRequest(appRequest)) {
    return null;
  }

  const runtime = submittedConfigObject(appRequest)?.importRuntime;

  if (
    runtime &&
    typeof runtime === "object" &&
    !Array.isArray(runtime) &&
    "azureRuntimeStack" in runtime &&
    "startupCommand" in runtime &&
    typeof runtime.azureRuntimeStack === "string" &&
    typeof runtime.startupCommand === "string"
  ) {
    return runtime as {
      azureRuntimeStack: string;
      startupCommand: string;
    };
  }

  return null;
}
```

Then resolve:

```ts
function selectedAppServiceRuntime(appRequest, config) {
  return (
    importedRuntimeFromSubmittedConfig(appRequest) ??
    (isImportedAppRequest(appRequest)
      ? null
      : requireTemplate(appRequest)
    )?.appServiceRuntime ?? {
      azureRuntimeStack: config.runtimeStack,
      startupCommand: STARTUP_COMMAND,
    }
  );
}
```

Existing `selectedDatabaseProvider` and `selectedEntraLogin` already honor submitted config before defaults; keep that behavior and add tests for imported FastAPI.

- [ ] **Step 4: Run publish/setup tests to verify green**

Run:

```bash
npm test -- src/features/publishing/azure/runtime.test.ts src/features/publishing/setup/service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```bash
git add src/features/publishing/azure/runtime.ts src/features/publishing/azure/runtime.test.ts src/features/publishing/setup/service.ts src/features/publishing/setup/service.test.ts
git commit -m "feat: publish imported apps by runtime"
```

---

### Task 8: Update UI And Docs

**Files:**
- Modify: `src/app/apps/add/page.tsx`
- Modify: `src/app/apps/add/page.test.tsx`
- Modify: `README.md`
- Modify: `docs/portal/setup.md`

- [ ] **Step 1: Write failing UI/docs tests**

In `src/app/apps/add/page.test.tsx`, add an assertion to the existing page render test:

```ts
expect(
  screen.getByText(/currently detects root next.js and python fastapi apps/i),
).toBeInTheDocument();
```

Update docs tests if `docs/readme.test.ts` or other existing assertions reference Next-only wording.

- [ ] **Step 2: Run UI/docs tests to verify failure**

Run:

```bash
npm test -- src/app/apps/add/page.test.tsx docs/readme.test.ts
```

Expected: FAIL until the page/docs wording is updated.

- [ ] **Step 3: Update visible copy and docs**

In `src/app/apps/add/page.tsx`, update the “Already on GitHub” description:

```tsx
<p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
  Paste the repository URL and the portal will copy it into the managed
  Cedarville org when needed. The portal currently detects root Next.js
  and Python FastAPI apps for Azure App Service publishing.
</p>
```

In `README.md`, replace the Next-only import sentence with:

```md
Users can also add an existing compatible GitHub app repository. If the source repository is outside the configured Cedarville GitHub org, the portal imports it into the shared org while preserving history, scans and prepares it for supported Azure App Service runtimes, and lets the user choose either direct publishing additions or a review PR. Current import support covers root Next.js and Python FastAPI apps.
```

In `docs/portal/setup.md`, replace the V1 import support sentence with:

```md
V1 supports root Next.js and Python FastAPI apps for Azure App Service publishing. After import or scan, the portal prepares the repository for the matching supported Azure App Service publishing path.
```

- [ ] **Step 4: Run UI/docs tests to verify green**

Run:

```bash
npm test -- src/app/apps/add/page.test.tsx docs/readme.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
git add src/app/apps/add/page.tsx src/app/apps/add/page.test.tsx README.md docs/portal/setup.md
git commit -m "docs: describe imported runtime support"
```

---

### Task 9: Final Verification

**Files:**
- All modified files from prior tasks.

- [ ] **Step 1: Run focused repository import and publishing tests**

Run:

```bash
npm test -- src/features/repository-imports/compatibility.test.ts src/features/repository-imports/publishing-bundle.test.ts src/features/repository-imports/prepare-repository.test.ts src/features/repository-imports/actions.test.ts src/features/publishing/azure/runtime.test.ts src/features/publishing/setup/service.test.ts src/app/apps/add/page.test.tsx docs/readme.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full unit test suite**

Run:

```bash
npm test
```

Expected: all Vitest files pass.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: exit 0. The existing worktree multiple-lockfile warning may appear.

- [ ] **Step 4: Run create/download e2e smoke**

Run:

```bash
npm run test:e2e -- e2e/create-and-download.spec.ts
```

Expected: 1 test passes. The local GitHub App env warning may appear during bootstrap.

- [ ] **Step 5: Check git status and whitespace**

Run:

```bash
git status --short --branch
git diff --check 880ebbc39480ee619d8fcaff25ab7a3b2fcce20f..HEAD
```

Expected: clean status after commits and no whitespace errors.

- [ ] **Step 6: Request final code review**

Use `superpowers:requesting-code-review` over the feature range after all implementation commits. Fix any Critical or Important findings before final delivery.
