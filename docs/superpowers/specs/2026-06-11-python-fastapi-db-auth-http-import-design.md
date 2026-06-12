# Python FastAPI DB/Auth And Http Server Import Design

## Goal

Expand the Azure App Service template and import model without adding confusing
generated template choices.

Generated templates should remain focused:

- Next.js Web App
- Python FastAPI

The Python FastAPI generated template should support optional PostgreSQL and
browser-style Microsoft Entra login. Imported apps should additionally support
simple Python `http.server` repositories, but only as static/simple App Service
imports without database or Entra setup.

## Decisions

- Do not add a generated `http.server` template.
- Add database and Entra options to the existing `python-fastapi` generated
  template.
- Implement Entra for generated FastAPI as browser login:
  `/login`, `/auth/callback`, logout/session handling, and a protected sample
  route.
- Keep imported `http.server` apps simple:
  `databaseProvider: "none"` and `entraLogin: false`.
- Detect imported `http.server` only when no stronger supported runtime signal
  exists.

## Generated FastAPI Template

The catalog entry for `python-fastapi` should change from unsupported features
to optional features:

- database: optional PostgreSQL, default `none`
- Entra login: optional, default `false`

Defaulting both off keeps the compact API starter simple, while allowing users
to opt into data and Cedarville login when they need them.

When PostgreSQL is selected, the generated source should include:

- `psycopg[binary]` as the database dependency
- `DATABASE_URL` in `.env.example`
- a small data/status helper
- a sample endpoint that proves database connectivity
- docs explaining local and Azure database configuration

When Entra login is selected, the generated source should include:

- `authlib` for the OAuth code flow
- `itsdangerous` for signed session state
- browser login route
- callback route
- logout route
- signed session cookie support
- a protected sample route or page
- Entra environment variables in `.env.example`
- docs explaining redirect URI and secret expectations

When both features are selected, the generated app should combine them without
duplicating setup or creating contradictory docs.

## Entra Browser Login Shape

FastAPI should use a minimal, readable auth implementation rather than a large
framework abstraction. The starter should demonstrate the core flow:

1. `/login` redirects to Microsoft identity platform authorization.
2. `/auth/callback` exchanges the authorization code for tokens.
3. The app stores a signed session cookie with basic user claims.
4. `/logout` clears the session.
5. A protected sample route requires the signed session.

The generated app should not attempt to be a complete identity platform. It
should provide a clear, working starter that Cedarville developers can extend.

## Imported Http Server Runtime

Imported `http.server` support should target simple static or root Python web
repositories. Detection should happen after stronger runtimes:

1. Next.js
2. FastAPI
3. Python `http.server`

The importer should reject ambiguous repositories. A repository that has both a
FastAPI entrypoint and static files should be treated as FastAPI, not
`http.server`. A repository that has both Next.js and `http.server` indicators
should be rejected as ambiguous, because it contains two different supported
root app shapes.

Minimum `http.server` detection should require a clear static root signal such
as root `index.html`. Optional static files can be included, but generic Python
files alone should not make a repository compatible.

Imported `http.server` runtime metadata should use:

- family: `python`
- framework: `http-server`
- display name: `Python 3.14 / http.server`
- Azure runtime stack: `PYTHON|3.14`
- startup command: `python app-portal/http_server_start.py`
- workflow file: `deploy-azure-app-service.yml`

The publishing bundle should add `app-portal/http_server_start.py`. That wrapper
should read `PORT`, default to `8000`, bind to `0.0.0.0`, and serve the
repository root. This avoids relying on shell-specific environment expansion in
the App Service startup command.

## Imported Http Server Bundle

The publishing bundle for imported `http.server` apps should:

- avoid rewriting `package.json`
- avoid adding database or auth settings
- generate the Python App Service workflow
- generate the deployment manifest with `databaseProvider: "none"` and
  `entraLogin: false`
- write docs that call out the static/simple nature of this path

Readiness checks should verify the publishing bundle paths and the static root
runtime signal. They should not require `package.json`, `requirements.txt`, or
FastAPI dependencies for `http.server`.

## UI And Copy

The generated template list should still show two primary choices. FastAPI copy
should mention that database and Entra can be enabled when needed.

The add-existing-app copy should update from "Next.js and Python FastAPI" to
say the portal detects root Next.js, Python FastAPI, and simple Python static
apps for Azure App Service publishing.

## Testing

Add coverage for:

- catalog metadata for FastAPI optional PostgreSQL and optional Entra
- create form rendering FastAPI database/auth controls
- validation accepting FastAPI with database, Entra, and both
- generated FastAPI archive with database only, Entra only, and both
- deployment manifest feature defaults for FastAPI selections
- publishing setup and Azure runtime behavior for FastAPI database/auth choices
- imported `http.server` compatibility detection
- ambiguous import cases involving `http.server`
- imported `http.server` publishing bundle generation
- imported `http.server` readiness without package or requirements files
- UI/docs copy describing current import support

## Non-Goals

- No generated `http.server` template.
- No database or Entra support for imported `http.server` apps.
- No bearer-token API auth implementation for FastAPI in this slice.
- No Java, Express, Django, Flask, custom container, or monorepo import support
  in this slice.
- No live Azure deployment automation as part of unit/e2e verification.

## Rollback

The feature should remain isolated behind catalog/template/import detection
changes. If needed, rollback can disable the new FastAPI feature options and
remove `http.server` from imported compatibility detection without affecting the
existing Next.js and FastAPI no-feature paths.
