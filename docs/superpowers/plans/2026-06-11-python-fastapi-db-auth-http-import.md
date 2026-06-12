# Python FastAPI DB/Auth And Http Server Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional PostgreSQL and browser Entra login to the generated FastAPI template, and add import-only support for simple Python `http.server` repositories.

**Architecture:** Keep generated template choices focused on Next.js and FastAPI. Move generated FastAPI feature-specific source content into a focused generation helper, while repository import detection grows a third imported runtime for static Python apps. Publishing/setup continues to consume runtime and feature metadata from template catalog or imported submitted config.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Testing Library, FastAPI, Authlib, itsdangerous, psycopg, Azure App Service, GitHub Actions.

---

## File Structure

- `src/features/templates/types.ts`: add `http-server` as a supported Python runtime framework for imported runtime metadata.
- `src/features/templates/catalog.ts`: make `python-fastapi` database and Entra optional, defaulting off.
- `src/features/generation/python-fastapi-source.ts`: new focused builder for generated FastAPI `main.py`, `requirements.txt`, `.env.example`, README, and Python-specific docs/skill text.
- `src/features/generation/build-source-snapshot.ts`: delegate FastAPI generated override files to `buildPythonFastApiGeneratedFiles`.
- `templates/python-fastapi/template.json`: mark generated override files so the new FastAPI generator owns feature-specific content.
- `src/features/repository-imports/compatibility.ts`: detect imported `http.server` static apps after Next/FastAPI and return runtime metadata.
- `src/features/repository-imports/publishing-bundle.ts`: generate runtime-specific bundle files for `http.server`, including `app-portal/http_server_start.py`.
- `src/features/repository-imports/prepare-repository.ts`: read static root files and use runtime-specific publishing paths.
- `src/features/repository-imports/publish-readiness.ts`: verify `http.server` readiness without package or Python dependency files.
- `src/features/repository-imports/actions.ts`: no new action contract, but tests should prove `http.server` persists as no DB/no Entra through existing paths.
- `src/features/publishing/azure/runtime.ts` and `src/features/publishing/setup/service.ts`: continue accepting stored imported Python runtime metadata; add tests for `http.server`.
- `src/app/create/*`, `src/app/apps/add/*`, `README.md`, `docs/portal/setup.md`, `docs/portal/template-authoring.md`: update user-facing copy and tests.

---

### Task 1: Make FastAPI Features Optional In Catalog And Create UI

**Files:**
- Modify: `src/features/templates/types.ts`
- Modify: `src/features/templates/catalog.ts`
- Test: `src/features/templates/catalog.test.ts`
- Test: `src/app/create/page.test.tsx`
- Test: `src/app/create/[templateSlug]/page.test.tsx`
- Test: `src/features/create-app/template-form-fields.test.tsx`
- Test: `src/features/create-app/validation.test.ts`

- [ ] **Step 1: Write failing catalog and UI tests**

In `src/features/templates/catalog.test.ts`, add assertions to the FastAPI template test:

```ts
const fastApi = getTemplateBySlug("python-fastapi");

expect(fastApi?.features.database).toEqual({
  mode: "optional",
  providerOptions: ["postgresql"],
  defaultProvider: "none",
});
expect(fastApi?.features.entraLogin).toEqual({
  mode: "optional",
  defaultEnabled: false,
});
expect(fastApi?.decisionSummary).toMatch(/database/i);
expect(fastApi?.decisionSummary).toMatch(/Entra/i);
```

In `src/features/create-app/template-form-fields.test.tsx`, add a FastAPI case:

```tsx
it("renders optional database and login controls for FastAPI with no-feature defaults", () => {
  const template = getTemplateBySlug("python-fastapi");

  if (!template) throw new Error("python-fastapi template missing");

  render(<TemplateFormFields template={template} />);

  expect(screen.getByRole("group", { name: /database/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /postgresql/i })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: /no database/i })).toBeChecked();
  expect(screen.getByRole("group", { name: /login/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /microsoft entra login/i })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: /no login/i })).toBeChecked();
});
```

In `src/features/create-app/validation.test.ts`, add:

```ts
it("accepts FastAPI with PostgreSQL and Entra login", () => {
  const template = getTemplateBySlug("python-fastapi");

  if (!template) throw new Error("python-fastapi template missing");

  const parsed = createAppSchema({
    hostingTarget: "Azure App Service",
    features: template.features,
  }).parse({
    appName: "Reports API",
    description: "Department reports",
    hostingTarget: "Azure App Service",
    databaseProvider: "postgresql",
    entraLogin: "true",
  });

  expect(parsed.databaseProvider).toBe("postgresql");
  expect(parsed.entraLogin).toBe(true);
});
```

In `src/app/create/page.test.tsx`, update the FastAPI card expectation:

```ts
expect(
  fastApi.getByText(/database and entra login can be enabled/i),
).toBeInTheDocument();
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/features/templates/catalog.test.ts src/features/create-app/template-form-fields.test.tsx src/features/create-app/validation.test.ts src/app/create/page.test.tsx src/app/create/[templateSlug]/page.test.tsx
```

Expected: FAIL because FastAPI still marks database and Entra unsupported and copy does not mention opt-in features.

- [ ] **Step 3: Update catalog and type**

In `src/features/templates/types.ts`, change the Python runtime framework union:

```ts
framework: "fastapi" | "http-server";
```

In `src/features/templates/catalog.ts`, update the `python-fastapi` entry:

```ts
decisionSummary:
  "Choose this for Python-backed APIs, automation endpoints, and services that benefit from Python libraries. PostgreSQL and Microsoft Entra login can be enabled when needed.",
bestFor: [
  "Python APIs",
  "Automation endpoints",
  "Data-adjacent service backends",
  "Apps that may need PostgreSQL or Cedarville login",
],
features: {
  database: {
    mode: "optional",
    providerOptions: ["postgresql"],
    defaultProvider: "none",
  },
  entraLogin: {
    mode: "optional",
    defaultEnabled: false,
  },
},
```

- [ ] **Step 4: Run tests to verify green**

Run:

```bash
npm test -- src/features/templates/catalog.test.ts src/features/create-app/template-form-fields.test.tsx src/features/create-app/validation.test.ts src/app/create/page.test.tsx src/app/create/[templateSlug]/page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/features/templates/types.ts src/features/templates/catalog.ts src/features/templates/catalog.test.ts src/features/create-app/template-form-fields.test.tsx src/features/create-app/validation.test.ts src/app/create/page.test.tsx src/app/create/[templateSlug]/page.test.tsx
git commit -m "feat: enable fastapi feature choices"
```

---

### Task 2: Generate FastAPI Source For Database And Browser Login

**Files:**
- Create: `src/features/generation/python-fastapi-source.ts`
- Test: `src/features/generation/python-fastapi-source.test.ts`
- Modify: `src/features/generation/build-source-snapshot.ts`
- Modify: `src/features/generation/build-archive.test.ts`
- Modify: `src/features/generation/build-source-snapshot.test.ts`
- Modify: `templates/python-fastapi/template.json`

- [ ] **Step 1: Write failing FastAPI source tests**

Create `src/features/generation/python-fastapi-source.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPythonFastApiGeneratedFiles } from "./python-fastapi-source";

const baseInput = {
  templateSlug: "python-fastapi",
  appName: "Reports API",
  description: "Department reports",
  hostingTarget: "Azure App Service" as const,
};

describe("buildPythonFastApiGeneratedFiles", () => {
  it("keeps the default FastAPI starter compact", () => {
    const files = buildPythonFastApiGeneratedFiles({
      ...baseInput,
      databaseProvider: "none",
      entraLogin: false,
    });

    expect(files["requirements.txt"]).toContain("fastapi==");
    expect(files["requirements.txt"]).toContain("gunicorn==");
    expect(files["requirements.txt"]).not.toContain("psycopg");
    expect(files["requirements.txt"]).not.toContain("authlib");
    expect(files[".env.example"]).toContain(
      "This starter does not require local environment variables by default.",
    );
    expect(files["main.py"]).toContain("@app.get(\"/api/health\")");
    expect(files["main.py"]).not.toContain("/login");
    expect(files["main.py"]).not.toContain("/api/data-status");
  });

  it("adds PostgreSQL helper code when selected", () => {
    const files = buildPythonFastApiGeneratedFiles({
      ...baseInput,
      databaseProvider: "postgresql",
      entraLogin: false,
    });

    expect(files["requirements.txt"]).toContain("psycopg[binary]");
    expect(files[".env.example"]).toContain("DATABASE_URL=");
    expect(files["main.py"]).toContain("psycopg.connect");
    expect(files["main.py"]).toContain("@app.get(\"/api/data-status\")");
    expect(files["README.md"]).toContain("PostgreSQL");
  });

  it("adds browser Entra login routes when selected", () => {
    const files = buildPythonFastApiGeneratedFiles({
      ...baseInput,
      databaseProvider: "none",
      entraLogin: true,
    });

    expect(files["requirements.txt"]).toContain("authlib");
    expect(files["requirements.txt"]).toContain("itsdangerous");
    expect(files[".env.example"]).toContain("AUTH_MICROSOFT_ENTRA_ID_ID=");
    expect(files["main.py"]).toContain("@app.get(\"/login\")");
    expect(files["main.py"]).toContain("@app.get(\"/auth/callback\")");
    expect(files["main.py"]).toContain("@app.get(\"/logout\")");
    expect(files["main.py"]).toContain("@app.get(\"/protected\")");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- src/features/generation/python-fastapi-source.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the FastAPI generator**

Create `src/features/generation/python-fastapi-source.ts`:

```ts
import type { CreateAppRequestInput } from "@/features/app-requests/types";

function toSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "") || "app"
  );
}

export function buildPythonFastApiGeneratedFiles(input: CreateAppRequestInput) {
  const hasDatabase = input.databaseProvider === "postgresql";
  const hasEntraLogin = input.entraLogin;

  return {
    "requirements.txt": buildRequirements({ hasDatabase, hasEntraLogin }),
    ".env.example": buildEnvExample(input, { hasDatabase, hasEntraLogin }),
    "main.py": buildMainPy(input, { hasDatabase, hasEntraLogin }),
    "README.md": buildReadme(input, { hasDatabase, hasEntraLogin }),
    ".codex/skills/publish-to-azure/SKILL.md": buildPublishSkill(input, {
      hasDatabase,
      hasEntraLogin,
    }),
    "docs/publishing/azure-app-service.md": buildAzureDocs(input, {
      hasDatabase,
      hasEntraLogin,
    }),
    "docs/publishing/lessons-learned.md":
      "# Publishing Lessons Learned\n\nRecord manual fixes and deployment blockers here.\n",
  };
}

function buildRequirements({
  hasDatabase,
  hasEntraLogin,
}: {
  hasDatabase: boolean;
  hasEntraLogin: boolean;
}) {
  return [
    "fastapi==0.115.6",
    "gunicorn==23.0.0",
    "uvicorn[standard]==0.32.1",
    ...(hasDatabase ? ["psycopg[binary]==3.2.3"] : []),
    ...(hasEntraLogin ? ["authlib==1.3.2", "itsdangerous==2.2.0"] : []),
    "",
  ].join("\n");
}

function buildEnvExample(
  input: CreateAppRequestInput,
  {
    hasDatabase,
    hasEntraLogin,
  }: {
    hasDatabase: boolean;
    hasEntraLogin: boolean;
  },
) {
  const lines = [
    ...(hasDatabase
      ? [
          `DATABASE_URL=postgresql://portal:portal@localhost:5432/${toSlug(
            input.appName,
          )}?sslmode=disable`,
        ]
      : []),
    ...(hasEntraLogin
      ? [
          "AUTH_URL=http://localhost:8000",
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

function buildMainPy(
  input: CreateAppRequestInput,
  {
    hasDatabase,
    hasEntraLogin,
  }: {
    hasDatabase: boolean;
    hasEntraLogin: boolean;
  },
) {
  const imports = [
    "import os",
    ...(hasDatabase ? ["import psycopg"] : []),
    ...(hasEntraLogin
      ? [
          "from authlib.integrations.starlette_client import OAuth",
          "from fastapi import Depends, HTTPException, Request",
          "from fastapi.responses import RedirectResponse",
          "from starlette.middleware.sessions import SessionMiddleware",
        ]
      : ["from fastapi import FastAPI"]),
    ...(hasEntraLogin ? ["from fastapi import FastAPI"] : []),
  ];
  const authSetup = hasEntraLogin
    ? `
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("AUTH_SECRET", "replace-me-for-local-dev"),
)

oauth = OAuth()
oauth.register(
    name="microsoft",
    client_id=os.environ.get("AUTH_MICROSOFT_ENTRA_ID_ID"),
    client_secret=os.environ.get("AUTH_MICROSOFT_ENTRA_ID_SECRET"),
    server_metadata_url=f'{os.environ.get("AUTH_MICROSOFT_ENTRA_ID_ISSUER", "").rstrip("/")}/.well-known/openid-configuration',
    client_kwargs={"scope": "openid email profile"},
)


def current_user(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required.")
    return user
`
    : "";
  const dataRoute = hasDatabase
    ? `

@app.get("/api/data-status")
def data_status():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return {"status": "missing", "message": "DATABASE_URL is not configured."}

    try:
        with psycopg.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("select 1")
                cursor.fetchone()
        return {"status": "ok", "message": "Database connection succeeded."}
    except Exception:
        return {"status": "pending", "message": "Database will be ready after publish."}
`
    : "";
  const authRoutes = hasEntraLogin
    ? `

@app.get("/login")
async def login(request: Request):
    redirect_uri = f'{os.environ.get("AUTH_URL", "http://localhost:8000").rstrip("/")}/auth/callback'
    return await oauth.microsoft.authorize_redirect(request, redirect_uri)


@app.get("/auth/callback")
async def auth_callback(request: Request):
    token = await oauth.microsoft.authorize_access_token(request)
    userinfo = token.get("userinfo") or {}
    request.session["user"] = {
        "name": userinfo.get("name"),
        "email": userinfo.get("email") or userinfo.get("preferred_username"),
    }
    return RedirectResponse(url="/protected")


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/")


@app.get("/protected")
def protected(user=Depends(current_user)):
    return {"message": "Signed in with Cedarville Entra.", "user": user}
`
    : "";

  return `${imports.join("\n")}

app = FastAPI(title=${JSON.stringify(input.appName)})
${authSetup}

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": ${JSON.stringify(input.appName)},
        "database": os.environ.get("DATABASE_URL") is not None,
        "entraLogin": ${hasEntraLogin ? "True" : "False"},
    }


@app.get("/")
def root():
    return {
        "name": ${JSON.stringify(input.appName)},
        "description": ${JSON.stringify(input.description)},
        "runtime": "Python 3.14 / FastAPI",
    }
${dataRoute}${authRoutes}`;
}

function buildReadme(
  input: CreateAppRequestInput,
  options: { hasDatabase: boolean; hasEntraLogin: boolean },
) {
  return `# ${input.appName}

${input.description}

This starter is a Python FastAPI app for Azure App Service.

## Local Development

\`\`\`bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
\`\`\`

Database: ${options.hasDatabase ? "PostgreSQL is enabled through DATABASE_URL." : "No database is enabled by default."}

Login: ${options.hasEntraLogin ? "Microsoft Entra browser login is enabled." : "No login is enabled by default."}
`;
}

function buildPublishSkill(
  input: CreateAppRequestInput,
  options: { hasDatabase: boolean; hasEntraLogin: boolean },
) {
  return `# Publish ${input.appName} To Azure App Service

Use the Cedarville App Portal publishing setup for this FastAPI app.

- Database: ${options.hasDatabase ? "provision PostgreSQL and set DATABASE_URL." : "do not provision a database."}
- Login: ${options.hasEntraLogin ? "set Entra auth app settings and redirect URI." : "do not add Entra settings."}
`;
}

function buildAzureDocs(
  input: CreateAppRequestInput,
  options: { hasDatabase: boolean; hasEntraLogin: boolean },
) {
  return `# Publish FastAPI To Azure App Service

${input.appName} deploys with Python 3.14 and Gunicorn.

- PostgreSQL: ${options.hasDatabase ? "enabled" : "not enabled"}
- Microsoft Entra login: ${options.hasEntraLogin ? "enabled" : "not enabled"}
`;
}
```

- [ ] **Step 4: Wire generated overrides**

In `templates/python-fastapi/template.json`, add:

```json
"generatedOverrides": [
  "README.md",
  "requirements.txt",
  "main.py",
  ".env.example",
  ".codex/skills/publish-to-azure/SKILL.md",
  "docs/publishing/azure-app-service.md",
  "docs/publishing/lessons-learned.md"
]
```

In `src/features/generation/build-source-snapshot.ts`, import the helper:

```ts
import { buildPythonFastApiGeneratedFiles } from "./python-fastapi-source";
```

At the end of `buildGeneratedTemplateFiles`, before returning, merge the FastAPI files when the selected template is `python-fastapi`:

```ts
const pythonFastApiFiles =
  input.templateSlug === "python-fastapi"
    ? buildPythonFastApiGeneratedFiles(input)
    : {};

return {
  ...instructionFiles,
  "package.json": buildPackageJsonFile(input),
  ".env.example": buildEnvExampleFile(input),
  "src/app/page.tsx": buildPageFile(input),
  "src/lib/app-data.ts": buildAppDataFile(input),
  "README.md": buildReadmeFile(input),
  ".codex/skills/publish-to-azure/SKILL.md": buildPublishSkillFile(input),
  "app-portal/deployment-manifest.json": deploymentManifest,
  ...pythonFastApiFiles,
};
```

- [ ] **Step 5: Add archive/source snapshot assertions**

In `src/features/generation/build-archive.test.ts`, add cases that build `python-fastapi` with:

```ts
databaseProvider: "postgresql",
entraLogin: true,
```

Assert the archive contains:

```ts
expect(archive.files["requirements.txt"]).toContain("psycopg[binary]");
expect(archive.files["requirements.txt"]).toContain("authlib");
expect(archive.files["main.py"]).toContain("@app.get(\"/auth/callback\")");
expect(archive.files["main.py"]).toContain("@app.get(\"/api/data-status\")");
expect(archive.files[".env.example"]).toContain("DATABASE_URL=");
expect(archive.files[".env.example"]).toContain("AUTH_MICROSOFT_ENTRA_ID_ID=");
```

- [ ] **Step 6: Run tests to verify green**

Run:

```bash
npm test -- src/features/generation/python-fastapi-source.test.ts src/features/generation/build-source-snapshot.test.ts src/features/generation/build-archive.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/features/generation/python-fastapi-source.ts src/features/generation/python-fastapi-source.test.ts src/features/generation/build-source-snapshot.ts src/features/generation/build-source-snapshot.test.ts src/features/generation/build-archive.test.ts templates/python-fastapi/template.json
git commit -m "feat: generate fastapi feature source"
```

---

### Task 3: Verify FastAPI Manifest And Publishing Setup With DB/Auth

**Files:**
- Test: `src/features/generation/deployment-manifest.test.ts`
- Test: `src/features/publishing/azure/runtime.test.ts`
- Test: `src/features/publishing/setup/service.test.ts`

- [ ] **Step 1: Add manifest tests for FastAPI DB/auth**

In `src/features/generation/deployment-manifest.test.ts`, add:

```ts
it("includes database and auth defaults for FastAPI when selected", () => {
  const manifest = buildDeploymentManifest({
    templateSlug: "python-fastapi",
    appName: "Reports API",
    description: "Department reports",
    hostingTarget: "Azure App Service",
    databaseProvider: "postgresql",
    entraLogin: true,
  });

  expect(manifest.runtime.framework).toBe("fastapi");
  expect(manifest.defaults.azure.database).toEqual({
    provider: "postgresql",
    adminUser: "portaladmin",
    sslMode: "require",
  });
  expect(manifest.auth).toEqual({
    provider: "microsoft-entra-id",
    callbackPath: "/api/auth/callback/microsoft-entra-id",
  });
  expect(manifest.applicationSettings).toEqual(
    expect.arrayContaining([
      "DATABASE_URL",
      "AUTH_URL",
      "AUTH_SECRET",
      "AUTH_MICROSOFT_ENTRA_ID_ID",
      "AUTH_MICROSOFT_ENTRA_ID_SECRET",
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
    ]),
  );
});
```

- [ ] **Step 2: Add publishing runtime/setup tests**

In `src/features/publishing/azure/runtime.test.ts`, add a generated FastAPI request with:

```ts
template: { slug: "python-fastapi" },
submittedConfig: {
  templateSlug: "python-fastapi",
  databaseProvider: "postgresql",
  entraLogin: true,
},
```

Assert:

```ts
expect(arm.putPostgresDatabase).toHaveBeenCalled();
expect(graph.ensureRedirectUri).toHaveBeenCalled();
expect(arm.putWebApp).toHaveBeenCalledWith(
  expect.objectContaining({
    runtimeStack: "PYTHON|3.14",
    startupCommand:
      "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
  }),
);
```

In `src/features/publishing/setup/service.test.ts`, add a matching repair/preflight case and assert:

```ts
expect(arm.putPostgresDatabase).toHaveBeenCalled();
expect(graph.ensureRedirectUri).toHaveBeenCalled();
expect(arm.putAppSettings).toHaveBeenCalledWith(
  expect.objectContaining({
    settings: expect.objectContaining({
      DATABASE_URL: expect.stringContaining("postgresql://"),
      AUTH_SECRET: expect.any(String),
      AUTH_MICROSOFT_ENTRA_ID_ID: expect.any(String),
    }),
  }),
);
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm test -- src/features/generation/deployment-manifest.test.ts src/features/publishing/azure/runtime.test.ts src/features/publishing/setup/service.test.ts
```

Expected: PASS. These should pass with existing feature-driven publish code after Task 1.

- [ ] **Step 4: Commit Task 3**

```bash
git add src/features/generation/deployment-manifest.test.ts src/features/publishing/azure/runtime.test.ts src/features/publishing/setup/service.test.ts
git commit -m "test: cover fastapi database auth publishing"
```

---

### Task 4: Detect Imported Python Http Server Apps

**Files:**
- Modify: `src/features/repository-imports/compatibility.ts`
- Test: `src/features/repository-imports/compatibility.test.ts`

- [ ] **Step 1: Write failing compatibility tests**

In `src/features/repository-imports/compatibility.test.ts`, add:

```ts
it("accepts a simple static Python http.server app", () => {
  expect(
    scanRepositoryCompatibility({
      "index.html": "<h1>Campus Reports</h1>",
      "styles.css": "body { font-family: sans-serif; }",
    }),
  ).toMatchObject({
    status: "COMPATIBLE",
    canDirectCommit: true,
    runtime: {
      family: "python",
      framework: "http-server",
      displayName: "Python 3.14 / http.server",
      azureRuntimeStack: "PYTHON|3.14",
      startupCommand: "python app-portal/http_server_start.py",
    },
  });
});

it("rejects ambiguous Next.js and http.server repositories", () => {
  const result = scanRepositoryCompatibility({
    "package.json": JSON.stringify({
      scripts: { build: "next build" },
      dependencies: { next: "15.5.15" },
      engines: { node: ">=24" },
    }),
    "index.html": "<h1>Static app</h1>",
  });

  expect(result.status).toBe("UNSUPPORTED");
  expect(result.runtime).toBeNull();
  expect(result.findings).toContainEqual(
    expect.objectContaining({
      code: "AMBIGUOUS_APP_RUNTIME",
      message: expect.stringContaining("Next.js, FastAPI, or Python static"),
    }),
  );
});

it("prefers FastAPI when a FastAPI app also has static files", () => {
  const result = scanRepositoryCompatibility({
    "requirements.txt": "fastapi==0.115.6\ngunicorn==23.0.0\nuvicorn[standard]==0.32.1\n",
    "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    "index.html": "<h1>Docs</h1>",
  });

  expect(result.status).toBe("COMPATIBLE");
  expect(result.runtime).toMatchObject({ framework: "fastapi" });
});
```

- [ ] **Step 2: Run compatibility tests to verify failure**

Run:

```bash
npm test -- src/features/repository-imports/compatibility.test.ts
```

Expected: FAIL because `http-server` is not a runtime and unsupported wording still says only Next.js/FastAPI.

- [ ] **Step 3: Implement imported runtime metadata and detection**

In `src/features/repository-imports/compatibility.ts`, extend `ImportedAppRuntime`:

```ts
| {
    family: "python";
    framework: "http-server";
    displayName: "Python 3.14 / http.server";
    azureRuntimeStack: "PYTHON|3.14";
    startupCommand: "python app-portal/http_server_start.py";
    workflowFileName: "deploy-azure-app-service.yml";
  };
```

Add:

```ts
const IMPORTED_HTTP_SERVER_RUNTIME = {
  family: "python",
  framework: "http-server",
  displayName: "Python 3.14 / http.server",
  azureRuntimeStack: "PYTHON|3.14",
  startupCommand: "python app-portal/http_server_start.py",
  workflowFileName: "deploy-azure-app-service.yml",
} as const satisfies ImportedAppRuntime;

function hasHttpServerStaticRoot(files: RepositoryFileMap) {
  return hasFile(files, "index.html");
}
```

Replace the current runtime selection with explicit signal counting:

```ts
const hasHttpServerRuntime = hasHttpServerStaticRoot(files);
const runtimeSignalCount =
  Number(hasNextRuntime) +
  Number(hasFastApiRuntime) +
  Number(hasHttpServerRuntime && !hasFastApiRuntime);
const isAmbiguousRuntime =
  runtimeSignalCount > 1 || (hasNextRuntime && hasFastApiRuntime);
const runtime =
  hasNextRuntime && !isAmbiguousRuntime
    ? IMPORTED_NEXT_RUNTIME
    : fastApiEntrypoint && hasSupportedFastApiServer && !isAmbiguousRuntime
      ? importedFastApiRuntime(fastApiEntrypoint)
      : hasHttpServerRuntime && !hasFastApiRuntime && !isAmbiguousRuntime
        ? IMPORTED_HTTP_SERVER_RUNTIME
        : null;
```

Update unsupported wording:

```ts
"Repository must be a root Next.js, FastAPI, or Python static app for portal-managed Azure publishing."
```

Update workspace wording:

```ts
"V1 supports single root Next.js, FastAPI, or Python static apps, not workspace roots."
```

- [ ] **Step 4: Run compatibility tests**

Run:

```bash
npm test -- src/features/repository-imports/compatibility.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/features/repository-imports/compatibility.ts src/features/repository-imports/compatibility.test.ts
git commit -m "feat: detect imported http server apps"
```

---

### Task 5: Generate Http Server Import Publishing Bundle

**Files:**
- Modify: `src/features/repository-imports/publishing-bundle.ts`
- Test: `src/features/repository-imports/publishing-bundle.test.ts`

- [ ] **Step 1: Write failing bundle test**

In `src/features/repository-imports/publishing-bundle.test.ts`, add:

```ts
it("adds http.server publishing files without package rewrites or app settings", () => {
  const plan = planPublishingBundle({
    appName: "Static Reports",
    repositoryOwner: "cedarville-it",
    repositoryName: "static-reports",
    runtime: {
      family: "python",
      framework: "http-server",
      displayName: "Python 3.14 / http.server",
      azureRuntimeStack: "PYTHON|3.14",
      startupCommand: "python app-portal/http_server_start.py",
      workflowFileName: "deploy-azure-app-service.yml",
    },
    files: {
      "index.html": "<h1>Reports</h1>",
    },
  });

  expect(plan.filesToWrite["package.json"]).toBeUndefined();
  expect(plan.filesToWrite["app-portal/http_server_start.py"]).toContain(
    "HTTPServer",
  );
  expect(
    plan.filesToWrite[".github/workflows/deploy-azure-app-service.yml"],
  ).toContain("Setup Python");
  expect(
    plan.filesToWrite[".github/workflows/deploy-azure-app-service.yml"],
  ).not.toContain("pip install -r requirements.txt");

  const manifest = JSON.parse(
    plan.filesToWrite["app-portal/deployment-manifest.json"],
  );
  expect(manifest.runtime.framework).toBe("http-server");
  expect(manifest.applicationSettings).not.toContain("DATABASE_URL");
  expect(manifest.applicationSettings).not.toContain("AUTH_SECRET");
});
```

- [ ] **Step 2: Run bundle tests to verify failure**

Run:

```bash
npm test -- src/features/repository-imports/publishing-bundle.test.ts
```

Expected: FAIL because `http-server` workflow and startup wrapper are not generated.

- [ ] **Step 3: Add HTTP server workflow and wrapper**

In `src/features/repository-imports/publishing-bundle.ts`, add:

```ts
function buildHttpServerStartupWrapper() {
  return `import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

host = "0.0.0.0"
port = int(os.environ.get("PORT", "8000"))

server = ThreadingHTTPServer((host, port), SimpleHTTPRequestHandler)
print(f"Serving static files on {host}:{port}")
server.serve_forever()
`;
}
```

Update `buildDeployWorkflow` so `runtime.framework === "http-server"` returns a Python workflow that does not install dependencies:

```ts
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
```

Before returning from `planPublishingBundle`, add:

```ts
if (runtime.framework === "http-server") {
  filesToWrite["app-portal/http_server_start.py"] =
    buildHttpServerStartupWrapper();
}
```

- [ ] **Step 4: Run bundle tests**

Run:

```bash
npm test -- src/features/repository-imports/publishing-bundle.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/features/repository-imports/publishing-bundle.ts src/features/repository-imports/publishing-bundle.test.ts
git commit -m "feat: bundle imported http server apps"
```

---

### Task 6: Prepare And Verify Http Server Imports

**Files:**
- Modify: `src/features/repository-imports/prepare-repository.ts`
- Modify: `src/features/repository-imports/publish-readiness.ts`
- Modify: `src/features/repository-imports/actions.test.ts`
- Test: `src/features/repository-imports/prepare-repository.test.ts`
- Test: `src/features/repository-imports/publish-readiness.test.ts`

- [ ] **Step 1: Write failing preparation and readiness tests**

In `src/features/repository-imports/prepare-repository.test.ts`, add:

```ts
it("commits http.server publishing additions directly", async () => {
  const github = {
    getBranchHead: vi.fn().mockResolvedValue({ sha: "head-sha" }),
    readRepositoryTextFiles: vi.fn().mockResolvedValue({
      "index.html": "<h1>Reports</h1>",
    }),
    commitFiles: vi.fn().mockResolvedValue({ commitSha: "commit-sha" }),
    createPullRequestWithFiles: vi.fn(),
  };

  await expect(
    prepareImportedRepository({
      appName: "Static Reports",
      owner: "cedarville-it",
      name: "static-reports",
      defaultBranch: "main",
      mode: "DIRECT_COMMIT",
      github,
    }),
  ).resolves.toMatchObject({
    status: "COMMITTED",
    runtime: { framework: "http-server" },
    databaseProvider: "none",
    entraLogin: false,
  });

  expect(github.readRepositoryTextFiles).toHaveBeenCalledWith(
    expect.objectContaining({
      paths: expect.arrayContaining(["index.html"]),
    }),
  );
  expect(github.commitFiles).toHaveBeenCalledWith(
    expect.objectContaining({
      files: expect.objectContaining({
        "app-portal/http_server_start.py": expect.stringContaining("HTTPServer"),
      }),
    }),
  );
});
```

In `src/features/repository-imports/publish-readiness.test.ts`, add:

```ts
it("verifies http.server publishing readiness without package or requirements files", async () => {
  const manifest = JSON.stringify({
    templateSlug: "imported-web-app",
    runtime: {
      family: "python",
      framework: "http-server",
      displayName: "Python 3.14 / http.server",
      azureRuntimeStack: "PYTHON|3.14",
      startupCommand: "python app-portal/http_server_start.py",
      workflowFileName: "deploy-azure-app-service.yml",
    },
  });
  const github = {
    readRepositoryTextFiles: vi.fn().mockResolvedValue({
      "index.html": "<h1>Reports</h1>",
      ".github/workflows/deploy-azure-app-service.yml": "content",
      ".codex/skills/publish-to-azure/SKILL.md": "content",
      "docs/publishing/azure-app-service.md": "content",
      "docs/publishing/lessons-learned.md": "content",
      "app-portal/deployment-manifest.json": manifest,
      "app-portal/http_server_start.py": "content",
    }),
  };

  await expect(
    verifyImportedPublishReadiness({
      owner: "cedarville-it",
      name: "static-reports",
      defaultBranch: "main",
      github,
    }),
  ).resolves.toMatchObject({
    ready: true,
    missingPaths: [],
    packageIssues: [],
    runtime: { framework: "http-server" },
    databaseProvider: "none",
    entraLogin: false,
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/features/repository-imports/prepare-repository.test.ts src/features/repository-imports/publish-readiness.test.ts
```

Expected: FAIL because `index.html` and the startup wrapper are not in read/readiness paths.

- [ ] **Step 3: Update paths and readiness requirements**

In `src/features/repository-imports/prepare-repository.ts`, add `"index.html"` to `READ_PATHS`.

In `src/features/repository-imports/publish-readiness.ts`, add `"index.html"` and `"app-portal/http_server_start.py"` to read paths. Compute missing paths by runtime:

```ts
const runtime = compatibility.runtime ?? parseManifestRuntime(files);
const requiredPublishingPaths = [
  ...PUBLISHING_BUNDLE_PATHS,
  ...(runtime && "framework" in runtime && runtime.framework === "http-server"
    ? ["app-portal/http_server_start.py"]
    : []),
];
const missingPaths = requiredPublishingPaths.filter(
  (path) => !Object.prototype.hasOwnProperty.call(files, path),
);
```

Keep defaults:

```ts
const isNext = runtime && "framework" in runtime && runtime.framework === "nextjs";
```

This keeps FastAPI and http-server at `databaseProvider: "none"` and `entraLogin: false`.

- [ ] **Step 4: Add action persistence test**

In `src/features/repository-imports/actions.test.ts`, add a direct-commit test where `prepareImportedRepository` returns an `http-server` runtime. Assert `prisma.appRequest.update` merges:

```ts
expect.objectContaining({
  submittedConfig: expect.objectContaining({
    templateSlug: "imported-web-app",
    importRuntime: expect.objectContaining({ framework: "http-server" }),
    databaseProvider: "none",
    entraLogin: false,
  }),
})
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/features/repository-imports/prepare-repository.test.ts src/features/repository-imports/publish-readiness.test.ts src/features/repository-imports/actions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/features/repository-imports/prepare-repository.ts src/features/repository-imports/prepare-repository.test.ts src/features/repository-imports/publish-readiness.ts src/features/repository-imports/publish-readiness.test.ts src/features/repository-imports/actions.test.ts
git commit -m "feat: prepare imported http server apps"
```

---

### Task 7: Publish And Repair Imported Http Server Apps

**Files:**
- Test: `src/features/publishing/azure/runtime.test.ts`
- Test: `src/features/publishing/setup/service.test.ts`

- [ ] **Step 1: Add runtime/setup tests**

In `src/features/publishing/azure/runtime.test.ts`, add an imported `http.server` request fixture:

```ts
const readyImportedHttpServerRequest = {
  ...readyImportedFastApiRequest,
  submittedConfig: {
    templateSlug: "imported-web-app",
    importRuntime: {
      family: "python",
      framework: "http-server",
      displayName: "Python 3.14 / http.server",
      azureRuntimeStack: "PYTHON|3.14",
      startupCommand: "python app-portal/http_server_start.py",
      workflowFileName: "deploy-azure-app-service.yml",
    },
    databaseProvider: "none",
    entraLogin: false,
  },
};
```

Add a test:

```ts
it("uses imported http.server runtime and skips database/auth provisioning", async () => {
  const { deps, arm, graph } = createDeps({
    appRequest: readyImportedHttpServerRequest,
  });
  const runtime = createAzurePublishRuntime(deps);

  await runtime.provisionInfrastructure("clx9abc123zzzzzzzzzz");

  expect(arm.putPostgresDatabase).not.toHaveBeenCalled();
  expect(graph.ensureRedirectUri).not.toHaveBeenCalled();
  expect(arm.putWebApp).toHaveBeenCalledWith(
    expect.objectContaining({
      runtimeStack: "PYTHON|3.14",
      startupCommand: "python app-portal/http_server_start.py",
    }),
  );
});
```

In `src/features/publishing/setup/service.test.ts`, add the same shape for preflight/repair and assert:

```ts
expect(arm.putWebApp).toHaveBeenCalledWith(
  expect.objectContaining({
    runtimeStack: "PYTHON|3.14",
    startupCommand: "python app-portal/http_server_start.py",
  }),
);
expect(arm.putPostgresDatabase).not.toHaveBeenCalled();
expect(graph.ensureRedirectUri).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run tests**

Run:

```bash
npm test -- src/features/publishing/azure/runtime.test.ts src/features/publishing/setup/service.test.ts
```

Expected: PASS because Task 1 extended the runtime type and existing imported runtime parsing accepts string stack/command.

- [ ] **Step 3: Commit Task 7**

```bash
git add src/features/publishing/azure/runtime.test.ts src/features/publishing/setup/service.test.ts
git commit -m "test: cover imported http server publishing"
```

---

### Task 8: Update UI And Docs Copy

**Files:**
- Modify: `src/app/apps/add/page.tsx`
- Modify: `src/app/apps/add/page.test.tsx`
- Modify: `README.md`
- Modify: `docs/portal/setup.md`
- Modify: `docs/portal/template-authoring.md`
- Test: `docs/readme.test.ts`

- [ ] **Step 1: Write failing copy tests**

In `src/app/apps/add/page.test.tsx`, update the existing import support assertion:

```ts
expect(
  screen.getByText(/currently detects root next.js, python fastapi, and simple python static apps/i),
).toBeInTheDocument();
```

In `docs/readme.test.ts`, update setup docs expectations:

```ts
expect(setup).toContain("root Next.js, Python FastAPI, and simple Python static apps");
expect(setup).toContain("FastAPI can opt into PostgreSQL and Microsoft Entra login");
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/app/apps/add/page.test.tsx docs/readme.test.ts
```

Expected: FAIL until copy is updated.

- [ ] **Step 3: Update visible copy and docs**

In `src/app/apps/add/page.tsx`, update the import paragraph:

```tsx
Paste the repository URL and the portal will copy it into the managed
Cedarville org when needed. The portal currently detects root Next.js,
Python FastAPI, and simple Python static apps for Azure App Service publishing.
```

In `README.md`, update the import support sentence:

```md
Current import support covers root Next.js, Python FastAPI, and simple Python static apps.
```

In `docs/portal/setup.md`, update the Add Existing App section:

```md
V1 supports root Next.js, Python FastAPI, and simple Python static apps for Azure App Service publishing. Generated FastAPI apps can opt into PostgreSQL and Microsoft Entra login; imported Python static apps stay database-free and auth-free.
```

In `docs/portal/template-authoring.md`, update FastAPI feature wording:

```md
The Python FastAPI template supports optional PostgreSQL and optional Microsoft Entra login. Keep generated `http.server` templates out of the catalog; simple static Python apps are import-only.
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/app/apps/add/page.test.tsx docs/readme.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
git add src/app/apps/add/page.tsx src/app/apps/add/page.test.tsx README.md docs/portal/setup.md docs/portal/template-authoring.md docs/readme.test.ts
git commit -m "docs: describe fastapi features and static imports"
```

---

### Task 9: Final Verification

**Files:**
- All modified files from prior tasks.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/features/templates/catalog.test.ts src/features/create-app/template-form-fields.test.tsx src/features/create-app/validation.test.ts src/features/generation/python-fastapi-source.test.ts src/features/generation/build-source-snapshot.test.ts src/features/generation/build-archive.test.ts src/features/generation/deployment-manifest.test.ts src/features/repository-imports/compatibility.test.ts src/features/repository-imports/publishing-bundle.test.ts src/features/repository-imports/prepare-repository.test.ts src/features/repository-imports/publish-readiness.test.ts src/features/repository-imports/actions.test.ts src/features/publishing/azure/runtime.test.ts src/features/publishing/setup/service.test.ts src/app/create/page.test.tsx src/app/create/[templateSlug]/page.test.tsx src/app/apps/add/page.test.tsx docs/readme.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full unit suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. The existing multiple-lockfile warning may appear in worktrees.

- [ ] **Step 4: Run e2e smoke**

Run:

```bash
npm run test:e2e -- e2e/create-and-download.spec.ts
```

Expected: PASS. If port `3000` is already occupied by a non-bypass dev server, rerun on an isolated local port with `E2E_AUTH_BYPASS=true` and record the reason.

- [ ] **Step 5: Check status and whitespace**

Run:

```bash
git status --short --branch
git diff --check main..HEAD
```

Expected: clean worktree and no whitespace errors.

- [ ] **Step 6: Request final code review**

Dispatch a reviewer over `main..HEAD` with this summary:

```text
Generated FastAPI now supports optional PostgreSQL and browser-style Microsoft Entra login. Imported apps now support simple Python http.server static repositories with Python App Service runtime and no DB/auth defaults. Generated template choices remain Next.js and FastAPI only.
```

Fix any Critical or Important findings before delivery.
