# Imported App Runtime Options Design

## Purpose

Imported apps should use the same Azure App Service runtime model as generated templates instead of assuming every compatible repository is a Next.js app. The first expansion supports the runtimes already present in the portal catalog: Next.js and Python FastAPI.

## Goals

- Detect whether an imported repository is a supported Next.js or FastAPI app.
- Generate runtime-specific Azure publishing additions for imported repositories.
- Store the selected import runtime in the app request submitted configuration so publish, repair, and preflight paths can use it later.
- Preserve existing Next.js import behavior for compatible repositories.
- Keep FastAPI imports honest: App Service runtime support only, with no default PostgreSQL or Entra configuration in this milestone.

## Non-Goals

- No Java, Express, custom container, monorepo, pnpm, yarn, bun, or workspace-root import support in this slice.
- No user-selected runtime dropdown yet.
- No database or Entra setup for imported FastAPI apps.
- No automatic migration of previously imported apps beyond preserving the legacy imported Next.js fallback.

## Runtime Detection

The compatibility scanner should identify a repository runtime from root files:

- **Next.js**: root `package.json` with a `next` dependency or dev dependency.
- **FastAPI**: root `requirements.txt` or `pyproject.toml` with a FastAPI dependency.

Detection should return runtime metadata, not just a yes/no compatibility status. If both runtimes are detected, the repository is ambiguous and should be treated as unsupported for direct preparation in this milestone. If no supported runtime is detected, the existing unsupported flow remains.

## Compatibility Rules

Next.js imports keep the current root npm constraints:

- root `package.json`
- `build` script required
- `start` script can be added when missing
- `engines.node` can be added when missing
- unsupported package manager lockfiles and workspace roots still block direct preparation

FastAPI imports use Python-specific checks:

- root FastAPI dependency in `requirements.txt` or `pyproject.toml`
- root entrypoint file, initially `main.py` or `app.py`
- no Node package metadata required
- unsupported package manager lockfiles are irrelevant unless a conflicting Node app is also detected
- workspace-root markers still block preparation because the publishing path assumes a single root app

The scanner should keep returning findings that explain why the app can or cannot be prepared. Messages should name the detected or expected runtime so users understand why a repository was rejected.

## Publishing Bundle

`planPublishingBundle` should accept the detected import runtime and write runtime-specific files.

For Next.js, keep the existing behavior:

- add `next start` when `scripts.start` is missing
- add `engines.node >=24` when missing
- write the current Node 24 App Service workflow
- generate a manifest with `NODE|24-lts`, PostgreSQL enabled, and Entra enabled

For FastAPI:

- do not rewrite `package.json`
- write a Python 3.14 App Service workflow that installs dependencies into `.python_packages/lib/site-packages`
- deploy the repository contents with `azure/webapps-deploy`
- generate a manifest with `PYTHON|3.14`, FastAPI framework metadata, no database, and no Entra login
- write docs and publish skill text that describe the selected runtime without Next.js wording

Publishing path conflicts remain conflicts for both runtimes.

## Stored Request Configuration

Imported app requests should store enough configuration for later publish setup:

- `repositoryUrl`
- `description`
- `hostingTarget: "Azure App Service"`
- `templateSlug: "imported-web-app"`
- `importRuntime`, including family, framework, display name, Azure runtime stack, startup command, and workflow filename
- `databaseProvider`: `postgresql` for imported Next.js, `none` for imported FastAPI
- `entraLogin`: `true` for imported Next.js, `false` for imported FastAPI

The synthetic `imported-web-app` template remains the database row for imported apps. Runtime-specific behavior comes from submitted configuration when present, and legacy imported apps without runtime metadata keep the current Next.js fallback.

## Publishing And Repair

Azure publishing and setup repair should resolve runtime and feature choices in this order:

1. Valid runtime and feature metadata in `submittedConfig` for imported apps.
2. Legacy imported-app fallback to Node 24, PostgreSQL, and Entra.
3. Catalog template metadata for generated apps.

This preserves old imported app behavior while letting new imports publish as FastAPI.

## UI

The “Add Existing App” page does not need a runtime dropdown for this slice. It should tell users that the portal currently detects Next.js and Python FastAPI root apps.

The post-add/download flow can continue showing existing compatibility findings. Findings should provide enough runtime-specific wording for users to know whether they need a Next.js or FastAPI shape.

## Testing

Unit coverage should include:

- compatibility detection for Next.js, FastAPI from `requirements.txt`, FastAPI from `pyproject.toml`, ambiguous repos, and unsupported repos
- runtime-specific publishing bundle generation for Next.js and FastAPI
- no `package.json` rewrite for FastAPI imports
- submitted config storing import runtime and feature defaults after add/import
- Azure publish runtime and setup repair using imported FastAPI runtime/config when present
- legacy imported app fallback remaining Next.js-compatible

Existing import action and create/download e2e coverage should remain green.
