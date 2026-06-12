import type { CreateAppRequestInput } from "@/features/app-requests/types";

type FastApiFeatureOptions = {
  hasDatabase: boolean;
  hasEntraLogin: boolean;
};

function toSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "") || "app"
  );
}

export function buildPythonFastApiGeneratedFiles(
  input: CreateAppRequestInput,
) {
  const options = {
    hasDatabase: input.databaseProvider === "postgresql",
    hasEntraLogin: input.entraLogin,
  };

  return {
    "requirements.txt": buildRequirements(options),
    ".env.example": buildEnvExample(input, options),
    "main.py": buildMainPy(input, options),
    "README.md": buildReadme(input, options),
    ".codex/skills/publish-to-azure/SKILL.md": buildPublishSkill(
      input,
      options,
    ),
    "docs/publishing/azure-app-service.md": buildAzureDocs(input, options),
    "docs/publishing/lessons-learned.md": buildLessonsLearned(input, options),
  };
}

function buildRequirements({
  hasDatabase,
  hasEntraLogin,
}: FastApiFeatureOptions) {
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
  { hasDatabase, hasEntraLogin }: FastApiFeatureOptions,
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
  { hasDatabase, hasEntraLogin }: FastApiFeatureOptions,
) {
  const imports = [
    "import os",
    ...(hasDatabase ? ["import psycopg"] : []),
    ...(hasEntraLogin
      ? [
          "from authlib.integrations.starlette_client import OAuth",
          "from fastapi import Depends, FastAPI, HTTPException, Request",
          "from fastapi.responses import RedirectResponse",
          "from starlette.middleware.sessions import SessionMiddleware",
        ]
      : ["from fastapi import FastAPI"]),
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
    auth_url = os.environ.get("AUTH_URL", "http://localhost:8000").rstrip("/")
    redirect_uri = f"{auth_url}/auth/callback"
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
  { hasDatabase, hasEntraLogin }: FastApiFeatureOptions,
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

## App Data

${
  hasDatabase
    ? "PostgreSQL is enabled through `DATABASE_URL`. Use `/api/data-status` to confirm connectivity after local or Azure configuration."
    : "No database is enabled by default."
}

## Login

${
  hasEntraLogin
    ? "Microsoft Entra browser login is enabled with `/login`, `/auth/callback`, `/logout`, and `/protected` routes."
    : "No login is enabled by default."
}

## Publishing

Use \`docs/publishing/azure-app-service.md\` and the generated \`publish-to-azure\` Codex skill for the supported Azure App Service path.
`;
}

function buildPublishSkill(
  input: CreateAppRequestInput,
  { hasDatabase, hasEntraLogin }: FastApiFeatureOptions,
) {
  return `---
name: publish-to-azure
description: Publish this FastAPI app to Azure App Service using the generated manifest, GitHub Actions workflow, and fallback docs.
---

# Publish ${input.appName} To Azure App Service

Use this skill to publish this FastAPI app through the Cedarville App Portal supported path.

## Required Behavior

1. Read \`app-portal/deployment-manifest.json\` before choosing names, commands, Azure resources, or app settings.
2. Confirm \`git\`, \`gh\`, and \`az\` are installed and authenticated where required.
3. Prefer the portal-managed GitHub repository as the source of truth.
4. Create or verify the Azure resource group and App Service plan described by the manifest.
5. Create or verify the Azure App Service app with the Python runtime stack from the manifest.
6. Set the App Service startup command to the manifest startup command.
${
  hasDatabase
    ? "7. Create or verify Azure Database for PostgreSQL and set the production `DATABASE_URL` app setting with `sslmode=require`."
    : "7. This app was generated without a database. Do not provision PostgreSQL or add `DATABASE_URL` unless the app is intentionally changed later."
}
${
  hasEntraLogin
    ? "8. Configure Microsoft Entra app settings with the public App Service URL and `/auth/callback` redirect path."
    : "8. This app was generated without login. Do not add Microsoft Entra app settings unless the app is intentionally changed later."
}
9. Prefer the generated GitHub Actions workflow for deployment and verification.
10. Record blocked steps and manual fixes in \`docs/publishing/lessons-learned.md\`.

## Notes

- Runtime: Python 3.14 / FastAPI.
- Database: ${hasDatabase ? "PostgreSQL enabled." : "not enabled."}
- Login: ${hasEntraLogin ? "Microsoft Entra browser login enabled." : "not enabled."}
- Keep local settings in \`.env.example\`; put production secrets only in Azure App Service settings.
`;
}

function buildAzureDocs(
  input: CreateAppRequestInput,
  { hasDatabase, hasEntraLogin }: FastApiFeatureOptions,
) {
  return `# Publish FastAPI To Azure App Service

${input.appName} deploys with Python 3.14 and Gunicorn.

## Runtime

- Runtime stack: \`PYTHON|3.14\`
- Startup command: \`gunicorn -k uvicorn.workers.UvicornWorker main:app\`
- Workflow: \`.github/workflows/deploy-azure-app-service.yml\`

## Feature Settings

- PostgreSQL: ${hasDatabase ? "enabled through `DATABASE_URL`" : "not enabled"}
- Microsoft Entra login: ${
    hasEntraLogin
      ? "enabled through `AUTH_URL`, `AUTH_SECRET`, and Microsoft Entra client settings"
      : "not enabled"
  }

## Verification

After deployment, check \`/api/health\`.${
    hasDatabase ? " Check `/api/data-status` after database settings are applied." : ""
  }${hasEntraLogin ? " Use `/login` to verify the Entra browser flow." : ""}
`;
}

function buildLessonsLearned(
  input: CreateAppRequestInput,
  { hasDatabase, hasEntraLogin }: FastApiFeatureOptions,
) {
  return `# Publishing Lessons Learned

Record manual fixes and deployment blockers here.

## Generated Context

- App: ${input.appName}
- Runtime: Python 3.14 / FastAPI
- PostgreSQL: ${hasDatabase ? "enabled" : "not enabled"}
- Microsoft Entra login: ${hasEntraLogin ? "enabled" : "not enabled"}
`;
}
