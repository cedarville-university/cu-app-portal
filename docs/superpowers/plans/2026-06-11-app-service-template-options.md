# App Service Template Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the App Service-only create flow from one hardcoded Next.js starter into runtime-aware templates with user-facing descriptions, database choices, and Entra login choices.

**Architecture:** Template catalog entries become the source of truth for runtime metadata and supported feature options. Create validation, source generation, deployment manifests, and Azure publishing all consume the normalized submitted config instead of assuming Node/Next/PostgreSQL/Entra. The existing `web-app` starter remains behaviorally equivalent first, then FastAPI proves a non-Node template.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Prisma JSON fields, JSZip, Vitest, Playwright, Azure App Service, GitHub Actions.

---

## File Structure

- Modify `src/features/templates/types.ts` to add App Service runtime and feature capability types.
- Modify `src/features/templates/catalog.ts` to add decision-focused template metadata and runtime capabilities.
- Modify `src/features/templates/catalog.test.ts` to assert capability serialization and useful template descriptions.
- Modify `src/features/create-app/validation.ts` to validate database and Entra selections against a template.
- Modify `src/features/create-app/validation.test.ts` to cover optional, required, and unsupported feature combinations.
- Modify `src/features/app-requests/types.ts` to expose normalized create input types.
- Modify `src/app/create/actions.ts` to extract `databaseProvider` and `entraLogin` from the form.
- Modify `src/features/create-app/template-form-fields.tsx` and tests to render hidden or radio controls for database and Entra.
- Modify `src/features/create-app/template-form.tsx` and tests so create-and-publish remains available only for supported App Service templates.
- Modify `src/app/create/page.tsx` and tests to show decision summaries, runtime labels, best-for hints, and feature badges.
- Modify `src/app/create/[templateSlug]/page.tsx` and tests to show the same decision context on the selected template page.
- Modify `src/features/generation/deployment-manifest.ts` and tests to emit runtime-aware, feature-aware manifests.
- Modify `src/features/generation/build-source-snapshot.ts` and tests to support conditional template files while preserving current template manifest compatibility.
- Modify `src/features/generation/token-replacements.ts` to add feature/runtime tokens for template files.
- Modify `src/features/generation/instruction-files.ts` and `src/features/generation/publishing-files.ts` to describe selected database/auth choices.
- Modify `src/features/publishing/providers.ts` and tests to support template-aware App Service publishing capabilities.
- Modify `src/features/publishing/azure/runtime.ts` and tests to provision database and Entra settings conditionally.
- Modify `src/features/publishing/azure/config.ts` only if the runtime stack literal must accept Python or Java.
- Modify `templates/web-app/template.json` and selected files only after parity tests are in place.
- Create `templates/python-fastapi/` with template manifest and starter files.
- Modify `prisma/seed.test.ts` and `prisma/seed.ts` only if seed assumptions need to include capability metadata.
- Modify `docs/portal/template-authoring.md`, `docs/portal/setup.md`, and `README.md` to document the App Service-only template model.

No Prisma migration is required in this plan. `Template.inputSchema`, `Template.hostingOptions`, and `AppRequest.submittedConfig` are JSON columns and can store the expanded metadata and create selections.

---

### Task 1: Add Runtime And Feature Capability Metadata

**Files:**
- Modify: `src/features/templates/types.ts`
- Modify: `src/features/templates/catalog.ts`
- Modify: `src/features/templates/catalog.test.ts`

- [ ] **Step 1: Write failing catalog tests**

Add assertions that every active template has decision text, runtime metadata, and feature metadata:

```ts
it("describes active templates with decision-focused runtime metadata", () => {
  const templates = getActiveTemplates();

  expect(templates.map((template) => template.slug)).toEqual(["web-app"]);
  for (const template of templates) {
    expect(template.decisionSummary.length).toBeGreaterThan(20);
    expect(template.bestFor.length).toBeGreaterThan(0);
    expect(template.appServiceRuntime.azureRuntimeStack).toMatch(/\|/);
    expect(template.features.database.mode).toMatch(/optional|required|unsupported/);
    expect(template.features.entraLogin.mode).toMatch(/optional|required|unsupported/);
  }
});

it("serializes capability metadata for storage", () => {
  const template = getActiveTemplateBySlug("web-app");

  expect(serializeTemplateForStorage(template!)).toMatchObject({
    hostingOptions: ["Azure App Service"],
    inputSchema: expect.objectContaining({
      appServiceRuntime: expect.objectContaining({
        family: "node",
        framework: "nextjs",
        azureRuntimeStack: "NODE|24-lts",
      }),
      features: expect.objectContaining({
        database: expect.objectContaining({ mode: "optional" }),
        entraLogin: expect.objectContaining({ mode: "optional" }),
      }),
    }),
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/features/templates/catalog.test.ts`

Expected: FAIL because `PortalTemplate` does not have `decisionSummary`, `bestFor`, `appServiceRuntime`, or `features`.

- [ ] **Step 3: Add capability types**

Update `src/features/templates/types.ts` with these exported types:

```ts
export type AppServiceRuntimeFamily = "node" | "python" | "java";

export type AppServiceRuntime = {
  family: AppServiceRuntimeFamily;
  framework: "nextjs" | "express" | "fastapi" | "spring-boot";
  displayName: string;
  azureRuntimeStack: string;
  startupCommand: string;
  workflowFileName: string;
};

export type FeatureMode = "unsupported" | "optional" | "required";
export type DatabaseProvider = "none" | "postgresql";

export type TemplateFeatures = {
  database: {
    mode: FeatureMode;
    providerOptions: Exclude<DatabaseProvider, "none">[];
    defaultProvider: DatabaseProvider;
  };
  entraLogin: {
    mode: FeatureMode;
    defaultEnabled: boolean;
  };
};
```

Extend `PortalTemplate` with:

```ts
decisionSummary: string;
bestFor: string[];
hostingTarget: "Azure App Service";
appServiceRuntime: AppServiceRuntime;
features: TemplateFeatures;
```

- [ ] **Step 4: Update the catalog**

Keep the existing slug `web-app` and add the FastAPI catalog entry:

```ts
{
  id: "web-app-v1",
  slug: "web-app",
  name: "Next.js Web App",
  description:
    "A Cedarville-styled full-stack web application starter for Azure App Service.",
  decisionSummary:
    "Choose this when you need pages, forms, server-side logic, and Cedarville-styled UI in one project.",
  bestFor: ["Staff-facing web apps", "Forms and dashboards", "Apps that need frontend and backend code together"],
  hostingTarget: "Azure App Service",
  appServiceRuntime: {
    family: "node",
    framework: "nextjs",
    displayName: "Node.js 24 / Next.js",
    azureRuntimeStack: "NODE|24-lts",
    startupCommand: "npm start",
    workflowFileName: "deploy-azure-app-service.yml",
  },
  features: {
    database: {
      mode: "optional",
      providerOptions: ["postgresql"],
      defaultProvider: "postgresql",
    },
    entraLogin: {
      mode: "optional",
      defaultEnabled: true,
    },
  },
  version: "1.0.0",
  status: "ACTIVE",
  fields: [
    { name: "appName", label: "App Name", type: "text", required: true },
    { name: "description", label: "Short Description", type: "textarea", required: true },
    {
      name: "hostingTarget",
      label: "Hosting Target",
      type: "select",
      required: true,
      options: ["Azure App Service"],
    },
  ],
}
```

Add `python-fastapi` as `DISABLED` at first if template files do not exist yet, then switch to `ACTIVE` in Task 7. Its final metadata should use:

```ts
{
  id: "python-fastapi-v1",
  slug: "python-fastapi",
  name: "Python FastAPI",
  description:
    "A compact Python API starter for Azure App Service with FastAPI health and sample routes.",
  decisionSummary:
    "Choose this for Python-backed APIs, automation endpoints, and services that benefit from Python libraries.",
  bestFor: ["Python APIs", "Automation endpoints", "Data-adjacent service backends"],
  hostingTarget: "Azure App Service",
  appServiceRuntime: {
    family: "python",
    framework: "fastapi",
    displayName: "Python 3.14 / FastAPI",
    azureRuntimeStack: "PYTHON|3.14",
    startupCommand: "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
    workflowFileName: "deploy-azure-app-service.yml",
  },
  features: {
    database: {
      mode: "optional",
      providerOptions: ["postgresql"],
      defaultProvider: "none",
    },
    entraLogin: {
      mode: "unsupported",
      defaultEnabled: false,
    },
  },
}
```

- [ ] **Step 5: Serialize richer metadata**

Update `serializeTemplateForStorage` so `inputSchema` contains:

```ts
{
  fields: template.fields,
  decisionSummary: template.decisionSummary,
  bestFor: template.bestFor,
  appServiceRuntime: template.appServiceRuntime,
  features: template.features,
}
```

Keep `hostingOptions: ["Azure App Service"]` for existing database rows and tests.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- src/features/templates/catalog.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/templates/types.ts src/features/templates/catalog.ts src/features/templates/catalog.test.ts
git commit -m "feat: describe app service template capabilities"
```

---

### Task 2: Validate Template-Aware Database And Entra Choices

**Files:**
- Modify: `src/features/create-app/validation.ts`
- Modify: `src/features/create-app/validation.test.ts`
- Modify: `src/features/app-requests/types.ts`
- Modify: `src/app/create/actions.ts`
- Modify: `src/app/create/actions.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add tests for normalized feature selections:

```ts
const optionalFeatures = {
  database: {
    mode: "optional",
    providerOptions: ["postgresql"],
    defaultProvider: "postgresql",
  },
  entraLogin: { mode: "optional", defaultEnabled: true },
} satisfies TemplateFeatures;

it("accepts supported database and Entra selections", () => {
  const result = createAppSchema({
    hostingTarget: "Azure App Service",
    features: optionalFeatures,
  }).safeParse({
    appName: "Campus Dashboard",
    description: "Shows campus metrics.",
    hostingTarget: "Azure App Service",
    databaseProvider: "postgresql",
    entraLogin: "true",
  });

  expect(result).toMatchObject({
    success: true,
    data: expect.objectContaining({
      databaseProvider: "postgresql",
      entraLogin: true,
    }),
  });
});

it("rejects PostgreSQL when the template does not support a database", () => {
  const result = createAppSchema({
    hostingTarget: "Azure App Service",
    features: {
      database: { mode: "unsupported", providerOptions: [], defaultProvider: "none" },
      entraLogin: { mode: "unsupported", defaultEnabled: false },
    },
  }).safeParse({
    appName: "Campus Dashboard",
    description: "Shows campus metrics.",
    hostingTarget: "Azure App Service",
    databaseProvider: "postgresql",
    entraLogin: "false",
  });

  expect(result.success).toBe(false);
});
```

- [ ] **Step 2: Run the focused validation test and verify it fails**

Run: `npm test -- src/features/create-app/validation.test.ts`

Expected: FAIL because `createAppSchema` still accepts only hosting target options.

- [ ] **Step 3: Replace the schema input**

Change `createAppSchema` to accept this input:

```ts
export type CreateAppSchemaOptions = {
  hostingTarget: "Azure App Service";
  features: TemplateFeatures;
};
```

Return normalized data:

```ts
databaseProvider: z.enum(["none", "postgresql"]).default(options.features.database.defaultProvider),
entraLogin: z
  .union([z.boolean(), z.enum(["true", "false"])])
  .default(String(options.features.entraLogin.defaultEnabled))
  .transform((value) => value === true || value === "true"),
```

Add `superRefine` checks:

```ts
if (features.database.mode === "unsupported" && value.databaseProvider !== "none") {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["databaseProvider"],
    message: "This template does not support a database.",
  });
}
if (features.database.mode === "required" && value.databaseProvider === "none") {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["databaseProvider"],
    message: "Choose PostgreSQL for this template.",
  });
}
if (value.databaseProvider === "postgresql" && !features.database.providerOptions.includes("postgresql")) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["databaseProvider"],
    message: "This template does not support PostgreSQL.",
  });
}
if (features.entraLogin.mode === "unsupported" && value.entraLogin) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["entraLogin"],
    message: "This template does not support Entra login.",
  });
}
if (features.entraLogin.mode === "required" && !value.entraLogin) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["entraLogin"],
    message: "Entra login is required for this template.",
  });
}
```

- [ ] **Step 4: Update create input types**

In `src/features/app-requests/types.ts`, keep `CreateAppRequestInput` as `CreateAppInput & { templateSlug: string }`. The inferred `CreateAppInput` should now include `databaseProvider` and `entraLogin`.

- [ ] **Step 5: Update action extraction**

In `extractCreateAppInput`, build the payload with:

```ts
const payload = {
  templateSlug: template.slug,
  appName: String(formData.get("appName") ?? ""),
  description: String(formData.get("description") ?? ""),
  hostingTarget: String(formData.get("hostingTarget") ?? template.hostingTarget),
  databaseProvider: String(
    formData.get("databaseProvider") ?? template.features.database.defaultProvider,
  ),
  entraLogin: String(
    formData.get("entraLogin") ?? template.features.entraLogin.defaultEnabled,
  ),
};

const parsed = createAppSchema({
  hostingTarget: template.hostingTarget,
  features: template.features,
}).parse(payload);
```

- [ ] **Step 6: Update action tests**

Update existing create action tests so expected `submittedConfig` includes:

```ts
databaseProvider: "postgresql",
entraLogin: true,
```

Add a test that submitting `databaseProvider: "postgresql"` to a no-database template is rejected. Use a disabled or test-local catalog mock only if a real unsupported active template is not present yet.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- src/features/create-app/validation.test.ts src/app/create/actions.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/create-app/validation.ts src/features/create-app/validation.test.ts src/features/app-requests/types.ts src/app/create/actions.ts src/app/create/actions.test.ts
git commit -m "feat: validate app template feature choices"
```

---

### Task 3: Render Feature-Aware Create UI

**Files:**
- Modify: `src/features/create-app/template-form-fields.tsx`
- Modify: `src/features/create-app/template-form-fields.test.tsx`
- Modify: `src/features/create-app/template-form.tsx`
- Modify: `src/features/create-app/template-form.test.tsx`
- Modify: `src/app/create/page.tsx`
- Modify: `src/app/create/page.test.tsx`
- Modify: `src/app/create/[templateSlug]/page.tsx`
- Modify: `src/app/create/[templateSlug]/page.test.tsx`

- [ ] **Step 1: Write failing form-field tests**

Assert optional database and Entra controls render for `web-app`:

```ts
render(<TemplateFormFields template={webAppTemplate} />);

expect(screen.getByRole("group", { name: /database/i })).toBeInTheDocument();
expect(screen.getByLabelText(/postgresql/i)).toBeChecked();
expect(screen.getByLabelText(/no database/i)).toBeInTheDocument();
expect(screen.getByRole("group", { name: /login/i })).toBeInTheDocument();
expect(screen.getByLabelText(/microsoft entra login/i)).toBeChecked();
```

Assert unsupported Entra renders a hidden false input for FastAPI once the catalog entry is available:

```ts
const entraInput = container.querySelector('input[name="entraLogin"]');
expect(entraInput).toHaveAttribute("type", "hidden");
expect(entraInput).toHaveAttribute("value", "false");
```

- [ ] **Step 2: Run form tests and verify they fail**

Run: `npm test -- src/features/create-app/template-form-fields.test.tsx`

Expected: FAIL because the feature controls do not exist.

- [ ] **Step 3: Render database controls**

Add a `renderDatabaseField(template)` helper in `template-form-fields.tsx`.

For unsupported:

```tsx
return <input key="databaseProvider" name="databaseProvider" type="hidden" value="none" />;
```

For required:

```tsx
return <input key="databaseProvider" name="databaseProvider" type="hidden" value="postgresql" />;
```

For optional:

```tsx
<fieldset className="form-group">
  <legend className="form-label">Database</legend>
  <label className="choice-row">
    <input type="radio" name="databaseProvider" value="postgresql" defaultChecked={template.features.database.defaultProvider === "postgresql"} />
    <span>PostgreSQL</span>
  </label>
  <label className="choice-row">
    <input type="radio" name="databaseProvider" value="none" defaultChecked={template.features.database.defaultProvider === "none"} />
    <span>No database</span>
  </label>
</fieldset>
```

- [ ] **Step 4: Render Entra controls**

Add `renderEntraField(template)`.

For unsupported:

```tsx
return <input key="entraLogin" name="entraLogin" type="hidden" value="false" />;
```

For required:

```tsx
return <input key="entraLogin" name="entraLogin" type="hidden" value="true" />;
```

For optional:

```tsx
<fieldset className="form-group">
  <legend className="form-label">Login</legend>
  <label className="choice-row">
    <input type="radio" name="entraLogin" value="true" defaultChecked={template.features.entraLogin.defaultEnabled} />
    <span>Microsoft Entra login</span>
  </label>
  <label className="choice-row">
    <input type="radio" name="entraLogin" value="false" defaultChecked={!template.features.entraLogin.defaultEnabled} />
    <span>No login</span>
  </label>
</fieldset>
```

- [ ] **Step 5: Update create page cards**

On `src/app/create/page.tsx`, add visible decision text:

```tsx
<div className="card__title">{template.name}</div>
<p className="card__desc">{template.decisionSummary}</p>
<p className="muted">{template.appServiceRuntime.displayName}</p>
<ul className="template-best-for">
  {template.bestFor.map((item) => <li key={item}>{item}</li>)}
</ul>
```

Add compact feature labels:

```tsx
<span>Database: {template.features.database.mode}</span>
<span>Login: {template.features.entraLogin.mode === "unsupported" ? "No Entra" : "Entra available"}</span>
```

- [ ] **Step 6: Update selected template page**

On `src/app/create/[templateSlug]/page.tsx`, show `decisionSummary`, runtime label, best-for hints, and feature summary above the form. Keep the existing GitHub info box.

- [ ] **Step 7: Run focused UI tests**

Run:

```bash
npm test -- src/features/create-app/template-form-fields.test.tsx src/features/create-app/template-form.test.tsx src/app/create/page.test.tsx src/app/create/[templateSlug]/page.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/create-app/template-form-fields.tsx src/features/create-app/template-form-fields.test.tsx src/features/create-app/template-form.tsx src/features/create-app/template-form.test.tsx src/app/create/page.tsx src/app/create/page.test.tsx 'src/app/create/[templateSlug]/page.tsx' 'src/app/create/[templateSlug]/page.test.tsx'
git commit -m "feat: show template feature choices in create flow"
```

---

### Task 4: Emit Runtime-Aware And Feature-Aware Manifests

**Files:**
- Modify: `src/features/generation/deployment-manifest.ts`
- Modify: `src/features/generation/deployment-manifest.test.ts`
- Modify: `src/features/generation/token-replacements.ts`
- Modify: `src/features/generation/instruction-files.ts`
- Modify: `src/features/generation/publishing-files.ts`

- [ ] **Step 1: Write failing manifest tests**

Update the existing Node/Next test to include `databaseProvider: "postgresql"` and `entraLogin: true`.

Add a no-database/no-Entra case:

```ts
const input = {
  templateSlug: "web-app",
  appName: "Campus Hub",
  description: "Student services portal",
  hostingTarget: "Azure App Service",
  databaseProvider: "none",
  entraLogin: false,
} satisfies DeploymentManifestInput;

const manifest = buildDeploymentManifest(input);

expect(manifest.defaults.azure.database).toBeUndefined();
expect(manifest.environments.development.databaseUrl).toBeUndefined();
expect(manifest.environments.production.databaseUrlAppSetting).toBeUndefined();
expect(manifest.environments.production.authUrlAppSetting).toBeUndefined();
expect(manifest.applicationSettings).not.toContain("DATABASE_URL");
expect(manifest.applicationSettings).not.toContain("AUTH_MICROSOFT_ENTRA_ID_ID");
```

Add a FastAPI manifest case:

```ts
const manifest = buildDeploymentManifest({
  templateSlug: "python-fastapi",
  appName: "Reports API",
  description: "Reports endpoint",
  hostingTarget: "Azure App Service",
  databaseProvider: "none",
  entraLogin: false,
});

expect(manifest.runtime).toMatchObject({
  family: "python",
  framework: "fastapi",
  azureRuntimeStack: "PYTHON|3.14",
});
expect(manifest.defaults.azure.runtimeStack).toBe("PYTHON|3.14");
```

- [ ] **Step 2: Run manifest tests and verify they fail**

Run: `npm test -- src/features/generation/deployment-manifest.test.ts`

Expected: FAIL because manifest generation is hardcoded to Node/Next/PostgreSQL/Entra.

- [ ] **Step 3: Update manifest types**

Change `DeploymentManifest.runtime` to:

```ts
runtime: {
  family: AppServiceRuntime["family"];
  framework: AppServiceRuntime["framework"];
  displayName: string;
  azureRuntimeStack: string;
  startupCommand: string;
};
```

Make database/auth sections optional:

```ts
database?: {
  provider: "postgresql";
  adminUser: string;
  sslMode: "require";
};
auth?: {
  provider: "microsoft-entra-id";
  callbackPath: "/api/auth/callback/microsoft-entra-id";
};
```

- [ ] **Step 4: Read runtime from the catalog**

Inside `buildDeploymentManifest`, resolve:

```ts
const template = getTemplateBySlug(input.templateSlug);
if (!template) {
  throw new Error(`Template "${input.templateSlug}" not found.`);
}
const runtime = template.appServiceRuntime;
```

Use `runtime.azureRuntimeStack` and `runtime.startupCommand` in the manifest defaults.

- [ ] **Step 5: Build settings arrays from selected features**

Start with:

```ts
const applicationSettings = ["NODE_ENV"];
```

Append database settings only when `input.databaseProvider === "postgresql"`:

```ts
applicationSettings.push("DATABASE_URL");
```

Append Entra settings only when `input.entraLogin` is true:

```ts
applicationSettings.push(
  "AUTH_URL",
  "NEXTAUTH_URL",
  "AUTH_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ID",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
);
```

- [ ] **Step 6: Add generation tokens**

In `token-replacements.ts`, add:

```ts
DATABASE_PROVIDER: input.databaseProvider,
ENTRA_LOGIN_ENABLED: String(input.entraLogin),
AZURE_RUNTIME_STACK: template.appServiceRuntime.azureRuntimeStack,
APP_SERVICE_RUNTIME: template.appServiceRuntime.displayName,
```

- [ ] **Step 7: Update generated docs**

In instruction and publishing files, mention:

```ts
const databaseText =
  input.databaseProvider === "postgresql"
    ? "This app is configured for a portal-managed PostgreSQL database."
    : "This app was generated without a database.";

const authText = input.entraLogin
  ? "This app is configured for Microsoft Entra login."
  : "This app was generated without built-in login.";
```

- [ ] **Step 8: Run focused generation tests**

Run:

```bash
npm test -- src/features/generation/deployment-manifest.test.ts src/features/generation/render-template.test.ts src/features/generation/publishing-files.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/generation/deployment-manifest.ts src/features/generation/deployment-manifest.test.ts src/features/generation/token-replacements.ts src/features/generation/instruction-files.ts src/features/generation/publishing-files.ts
git commit -m "feat: generate runtime-aware deployment manifests"
```

---

### Task 5: Support Conditional Template Files While Preserving Web-App Parity

**Files:**
- Modify: `src/features/generation/build-source-snapshot.ts`
- Modify: `src/features/generation/build-archive.test.ts`
- Modify: `src/features/generation/build-source-snapshot.test.ts` if it exists, otherwise create it
- Modify: `templates/web-app/template.json`

- [ ] **Step 1: Write failing snapshot tests**

Create `src/features/generation/build-source-snapshot.test.ts` if it does not exist. Add:

```ts
it("keeps current web-app database and Entra files when both features are selected", async () => {
  const files = await buildSourceSnapshot({
    templateSlug: "web-app",
    appName: "Campus Hub",
    description: "Student services portal",
    hostingTarget: "Azure App Service",
    databaseProvider: "postgresql",
    entraLogin: true,
  });

  expect(files["prisma/schema.prisma"]).toContain("provider = \"postgresql\"");
  expect(files["src/app/api/auth/[...nextauth]/route.ts"]).toContain("handlers");
  expect(files["app-portal/deployment-manifest.json"]).toContain("DATABASE_URL");
});

it("omits web-app database and auth files when features are disabled", async () => {
  const files = await buildSourceSnapshot({
    templateSlug: "web-app",
    appName: "Campus Hub",
    description: "Student services portal",
    hostingTarget: "Azure App Service",
    databaseProvider: "none",
    entraLogin: false,
  });

  expect(files["prisma/schema.prisma"]).toBeUndefined();
  expect(files["src/app/api/auth/[...nextauth]/route.ts"]).toBeUndefined();
  expect(files["app-portal/deployment-manifest.json"]).not.toContain("DATABASE_URL");
});
```

- [ ] **Step 2: Run snapshot tests and verify they fail**

Run: `npm test -- src/features/generation/build-source-snapshot.test.ts`

Expected: FAIL because every listed `entryFile` is currently rendered unconditionally.

- [ ] **Step 3: Extend the template manifest type**

In `build-source-snapshot.ts`, change `TemplateManifest` to include:

```ts
conditionalEntryFiles?: {
  databasePostgresql?: string[];
  entraLogin?: string[];
};
```

- [ ] **Step 4: Build the entry file list from selected features**

Add:

```ts
function getEntryFilesForInput(manifest: TemplateManifest, input: CreateAppRequestInput) {
  const entryFiles = [...manifest.entryFiles];

  if (input.databaseProvider === "postgresql") {
    entryFiles.push(...(manifest.conditionalEntryFiles?.databasePostgresql ?? []));
  }

  if (input.entraLogin) {
    entryFiles.push(...(manifest.conditionalEntryFiles?.entraLogin ?? []));
  }

  return entryFiles;
}
```

Use this function in the render loop.

- [ ] **Step 5: Move web-app feature files into conditional groups**

In `templates/web-app/template.json`, remove these from `entryFiles` and add them to `conditionalEntryFiles.databasePostgresql`:

```json
[
  "prisma/schema.prisma.template",
  "prisma/migrations/00000000000000_init/migration.sql"
]
```

Move these into `conditionalEntryFiles.entraLogin`:

```json
[
  "src/app/api/auth/[...nextauth]/route.ts.template",
  "src/auth.ts.template"
]
```

Keep `.env.example.template` in base files and render comments based on tokens.

- [ ] **Step 6: Adjust web-app starter files for optional features**

Update `templates/web-app/files/src/app/page.tsx.template` and `src/lib/app-data.ts.template` so they do not require Prisma when `databaseProvider` is `none`. If the current starter imports Prisma from a database-only module, split database sample code into a conditional file before disabling database files.

- [ ] **Step 7: Run focused archive tests**

Run:

```bash
npm test -- src/features/generation/build-source-snapshot.test.ts src/features/generation/build-archive.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/generation/build-source-snapshot.ts src/features/generation/build-source-snapshot.test.ts src/features/generation/build-archive.test.ts templates/web-app/template.json templates/web-app/files
git commit -m "feat: render template files from selected features"
```

---

### Task 6: Make Azure Publishing Conditional

**Files:**
- Modify: `src/features/publishing/azure/runtime.ts`
- Modify: `src/features/publishing/azure/runtime.test.ts`
- Modify: `src/features/publishing/azure/config.ts`
- Modify: `src/features/publishing/azure/config.test.ts`
- Modify: `src/features/publishing/providers.ts`
- Modify: `src/features/publishing/providers.test.ts`

- [ ] **Step 1: Write failing Azure runtime tests**

Add a request with disabled features:

```ts
const readyNoFeatureRequest = {
  ...readyAppRequest,
  submittedConfig: {
    templateSlug: "web-app",
    appName: "Campus Dashboard",
    description: "Campus metrics",
    hostingTarget: "Azure App Service",
    databaseProvider: "none",
    entraLogin: false,
  },
};
```

Assert publishing skips database and Entra:

```ts
expect(arm.putPostgresDatabase).not.toHaveBeenCalled();
expect(arm.putAppSettings).toHaveBeenCalledWith(
  expect.objectContaining({
    settings: expect.not.objectContaining({
      DATABASE_URL: expect.any(String),
      AUTH_MICROSOFT_ENTRA_ID_ID: expect.any(String),
    }),
  }),
);
expect(graph.ensureRedirectUri).not.toHaveBeenCalled();
```

Add a FastAPI request and assert:

```ts
expect(arm.putWebApp).toHaveBeenCalledWith(
  expect.objectContaining({
    runtimeStack: "PYTHON|3.14",
    startupCommand: "python -m gunicorn main:app -k uvicorn.workers.UvicornWorker",
  }),
);
```

- [ ] **Step 2: Run focused Azure tests and verify they fail**

Run: `npm test -- src/features/publishing/azure/runtime.test.ts`

Expected: FAIL because the runtime loads no submitted config, always provisions PostgreSQL, always configures Entra, and uses the config-level Node stack.

- [ ] **Step 3: Load submitted config and template runtime**

Add `submittedConfig` to `PublishableAppRequest` and `loadPublishableRequest`.

Add helper:

```ts
function resolvePublishTemplate(appRequest: PublishableAppRequest) {
  const template = getTemplateBySlug(appRequest.template.slug);
  if (!template) {
    throw new Error(`Template "${appRequest.template.slug}" is not configured for publishing.`);
  }
  return template;
}
```

Normalize selected features from `appRequest.submittedConfig`:

```ts
function selectedDatabaseProvider(appRequest: PublishableAppRequest): DatabaseProvider {
  const value = appRequest.submittedConfig?.databaseProvider;
  return value === "postgresql" ? "postgresql" : "none";
}

function selectedEntraLogin(appRequest: PublishableAppRequest): boolean {
  return appRequest.submittedConfig?.entraLogin === true;
}
```

- [ ] **Step 4: Use template runtime for Web App creation**

In `provisionInfrastructure`, call:

```ts
const template = resolvePublishTemplate(appRequest);
```

Then use:

```ts
runtimeStack: template.appServiceRuntime.azureRuntimeStack,
startupCommand: template.appServiceRuntime.startupCommand,
```

- [ ] **Step 5: Provision PostgreSQL only when selected**

Wrap `putPostgresDatabase` and `DATABASE_URL` settings in:

```ts
if (selectedDatabaseProvider(appRequest) === "postgresql") {
  await deps.arm.putPostgresDatabase(...);
  settings.DATABASE_URL = buildDatabaseUrl(deps.config, names.databaseName);
}
```

Return `azureDatabaseName: null` or omit it when no database is selected, matching `ProvisionedPublishTarget` type updates in `src/features/publishing/run-publish-attempt.ts` if needed.

- [ ] **Step 6: Configure Entra only when selected**

Wrap auth app settings and `ensureRedirectUri` in:

```ts
if (selectedEntraLogin(appRequest)) {
  settings.AUTH_URL = primaryPublishUrl;
  settings.NEXTAUTH_URL = primaryPublishUrl;
  settings.AUTH_SECRET = deps.config.authSecret;
  settings.AUTH_MICROSOFT_ENTRA_ID_ID = deps.config.entraClientId;
  settings.AUTH_MICROSOFT_ENTRA_ID_SECRET = deps.config.entraClientSecret;
  settings.AUTH_MICROSOFT_ENTRA_ID_ISSUER = deps.config.entraIssuer;
  await deps.graph.ensureRedirectUri(...);
}
```

- [ ] **Step 7: Relax config runtime stack**

If `AzurePublishConfig.runtimeStack` remains in use, change its schema from `z.literal("NODE|24-lts")` to `nonBlankString`. Prefer using template runtime stack for generated apps and keep `AZURE_PUBLISH_RUNTIME_STACK` only as a legacy default.

- [ ] **Step 8: Update provider capabilities**

Change `supportsGeneratedTemplateOneStep` to accept either hosting target plus template slug or a `PortalTemplate`. The safest shape is:

```ts
export function supportsGeneratedTemplateOneStep(template: PortalTemplate) {
  return template.hostingTarget === "Azure App Service";
}
```

Update callers in `template-form.tsx` and `create/actions.ts`.

- [ ] **Step 9: Run focused publishing tests**

Run:

```bash
npm test -- src/features/publishing/azure/runtime.test.ts src/features/publishing/azure/config.test.ts src/features/publishing/providers.test.ts src/features/publishing/actions.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/features/publishing/azure/runtime.ts src/features/publishing/azure/runtime.test.ts src/features/publishing/azure/config.ts src/features/publishing/azure/config.test.ts src/features/publishing/providers.ts src/features/publishing/providers.test.ts src/features/publishing/actions.test.ts src/features/create-app/template-form.tsx src/app/create/actions.ts
git commit -m "feat: publish app service templates by selected features"
```

---

### Task 7: Add The FastAPI Template

**Files:**
- Create: `templates/python-fastapi/template.json`
- Create: `templates/python-fastapi/files/README.md.template`
- Create: `templates/python-fastapi/files/requirements.txt.template`
- Create: `templates/python-fastapi/files/main.py.template`
- Create: `templates/python-fastapi/files/.env.example.template`
- Create: `templates/python-fastapi/files/.gitignore.template`
- Create: `templates/python-fastapi/files/.github/workflows/deploy-azure-app-service.yml.template`
- Create: `templates/python-fastapi/files/.codex/skills/publish-to-azure/SKILL.md.template`
- Modify: `src/features/templates/catalog.ts`
- Modify: `src/features/generation/build-archive.test.ts`

- [ ] **Step 1: Write failing generation test**

Add to `build-archive.test.ts`:

```ts
it("builds the FastAPI Azure App Service starter archive", async () => {
  const archive = await buildArchive({
    templateSlug: "python-fastapi",
    appName: "Reports API",
    description: "Reports endpoint",
    hostingTarget: "Azure App Service",
    databaseProvider: "none",
    entraLogin: false,
  });

  expect(archive.filename).toBe("reports-api.zip");
  expect(archive.files["main.py"]).toContain("FastAPI");
  expect(archive.files["requirements.txt"]).toContain("fastapi");
  expect(archive.files["app-portal/deployment-manifest.json"]).toContain("PYTHON|3.14");
});
```

- [ ] **Step 2: Run archive test and verify it fails**

Run: `npm test -- src/features/generation/build-archive.test.ts`

Expected: FAIL because `templates/python-fastapi/template.json` does not exist.

- [ ] **Step 2a: Update catalog test for the newly active FastAPI template**

After the template files exist and before activating the catalog entry, update `catalog.test.ts` so the active slug assertion becomes:

```ts
expect(templates.map((template) => template.slug)).toEqual([
  "web-app",
  "python-fastapi",
]);
```

- [ ] **Step 3: Create `templates/python-fastapi/template.json`**

Use:

```json
{
  "slug": "python-fastapi",
  "version": "1.0.0",
  "entryFiles": [
    "README.md.template",
    "requirements.txt.template",
    "main.py.template",
    ".env.example.template",
    ".gitignore.template",
    ".github/workflows/deploy-azure-app-service.yml.template",
    ".codex/skills/publish-to-azure/SKILL.md.template"
  ],
  "conditionalEntryFiles": {},
  "generatedFiles": [
    "docs/github-setup.md",
    "docs/deployment-guide.md",
    "app-portal/deployment-manifest.json"
  ]
}
```

- [ ] **Step 4: Create FastAPI starter files**

`requirements.txt.template`:

```txt
fastapi==0.115.6
gunicorn==23.0.0
uvicorn[standard]==0.32.1
psycopg[binary]==3.2.3
```

`main.py.template`:

```py
import os
from fastapi import FastAPI

app = FastAPI(title="{{APP_NAME}}")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": "{{APP_NAME}}",
        "database": os.environ.get("DATABASE_URL") is not None,
    }


@app.get("/")
def root():
    return {
        "name": "{{APP_NAME}}",
        "description": "{{APP_DESCRIPTION}}",
        "runtime": "{{APP_SERVICE_RUNTIME}}",
    }
```

`.env.example.template`:

```txt
# Local development settings for {{APP_NAME}}
# Add DATABASE_URL only if you selected PostgreSQL during generation.
# DATABASE_URL=postgresql://portal:portal@localhost:5432/{{APP_NAME_SLUG}}?sslmode=disable
```

`.github/workflows/deploy-azure-app-service.yml.template`:

```yaml
name: Deploy to Azure App Service

on:
  workflow_dispatch:
  push:
    branches:
      - main

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.14"

      - name: Install dependencies
        run: python -m pip install -r requirements.txt

      - name: Azure login
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy
        uses: azure/webapps-deploy@v3
        with:
          app-name: ${{ secrets.AZURE_WEBAPP_NAME }}
          package: .
```

`README.md.template`:

````md
# {{APP_NAME}}

{{APP_DESCRIPTION}}

This starter is a Python FastAPI app for Azure App Service.

## Local development

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

The health endpoint is available at `/api/health`.
````

`.gitignore.template`:

```txt
.venv/
__pycache__/
*.pyc
.env
```

`.codex/skills/publish-to-azure/SKILL.md.template`:

```md
# Publish FastAPI To Azure App Service

Use the portal-managed publishing flow first. This generated repository includes `app-portal/deployment-manifest.json`, which describes the Azure App Service runtime, startup command, and selected database/auth options.

When changing deployment behavior, keep the GitHub Actions workflow and deployment manifest aligned.
```

- [ ] **Step 5: Activate FastAPI in catalog**

Change `python-fastapi` status from `DISABLED` to `ACTIVE`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- src/features/templates/catalog.test.ts src/features/generation/build-archive.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add templates/python-fastapi src/features/templates/catalog.ts src/features/generation/build-archive.test.ts
git commit -m "feat: add fastapi app service template"
```

---

### Task 8: Update Seed, Docs, And End-To-End Coverage

**Files:**
- Modify: `prisma/seed.test.ts`
- Modify: `README.md`
- Modify: `docs/portal/setup.md`
- Modify: `docs/portal/template-authoring.md`
- Modify: `e2e/create-and-download.spec.ts` if the template chooser text changed enough to require updates

- [ ] **Step 1: Update seed tests if needed**

Run: `npm test -- prisma/seed.test.ts`

If it fails because `inputSchema` changed shape, update expectations to check:

```ts
expect(template.inputSchema).toEqual(
  expect.objectContaining({
    fields: expect.any(Array),
    appServiceRuntime: expect.any(Object),
    features: expect.any(Object),
  }),
);
```

- [ ] **Step 2: Update README**

In `README.md`, replace single-template wording with:

```md
The portal offers App Service starter templates for full-stack Next.js apps and runtime-specific API starters. Each template explains when to use it and declares whether PostgreSQL and Microsoft Entra login are available.
```

- [ ] **Step 3: Update setup docs**

In `docs/portal/setup.md`, keep `AZURE_PUBLISH_RUNTIME_STACK=NODE|24-lts` documented as the current default for the legacy Next.js path, then add:

```md
Runtime-specific generated templates carry their App Service runtime stack in the generated deployment manifest. The portal-managed publisher uses that template runtime when creating the Web App.
```

- [ ] **Step 4: Update template authoring docs**

Document `decisionSummary`, `bestFor`, `appServiceRuntime`, `features`, and `conditionalEntryFiles`. Include an example:

```json
"conditionalEntryFiles": {
  "databasePostgresql": ["prisma/schema.prisma.template"],
  "entraLogin": ["src/auth.ts.template"]
}
```

- [ ] **Step 5: Run docs and seed tests**

Run:

```bash
npm test -- prisma/seed.test.ts docs/readme.test.ts docs/secret-hygiene.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run e2e smoke if local database is available**

Run:

```bash
npm run test:e2e -- e2e/create-and-download.spec.ts
```

Expected: PASS. If the local database or browser setup is unavailable, record the exact failure in the final implementation notes.

- [ ] **Step 7: Commit**

```bash
git add prisma/seed.test.ts README.md docs/portal/setup.md docs/portal/template-authoring.md e2e/create-and-download.spec.ts
git commit -m "docs: document app service template authoring"
```

---

### Task 9: Final Verification

**Files:**
- No planned source edits.

- [ ] **Step 1: Run unit test suite**

Run: `npm test`

Expected: PASS with all Vitest tests green.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Check git status**

Run: `git status --short --branch`

Expected: clean working tree on `codex/app-service-template-options`.

- [ ] **Step 4: Summarize verification**

Record:

```txt
npm test: passed
npm run build: passed
npm run test:e2e -- e2e/create-and-download.spec.ts: passed or not run with reason
```

- [ ] **Step 5: Prepare review handoff**

Summarize:

- capability metadata and UI additions
- normalized create input and validation
- conditional generation and manifest changes
- Azure publishing conditional behavior
- FastAPI template contents
- docs updated
- any known unsupported combinations, especially Entra login for FastAPI
