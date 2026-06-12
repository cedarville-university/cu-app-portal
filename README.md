# Cedarville App Portal

Internal portal for Cedarville staff to create a new app package from an approved template, track its managed GitHub repository, and move toward portal-managed Azure publishing.

## What It Does

The portal signs staff in with Microsoft Entra ID, guides them through a template-backed app creation form, generates a ZIP package, and now treats a portal-created GitHub repository as the canonical source of truth for supported publishing.

Users can also add an existing compatible GitHub app repository. If the source repository is outside the configured Cedarville GitHub org, the portal imports it into the shared org while preserving history, scans and prepares it for supported Azure App Service runtimes, and lets the user choose either direct publishing additions or a review PR. Current import support covers root Next.js apps, Python FastAPI apps, and plain static Python `http.server` apps with a root `index.html`.

For apps developed locally with Codex that are not on GitHub yet, the portal can create an empty managed repository in the shared org first. The app details page then provides Codex-ready git instructions to initialize the local project when needed, add the managed repository as a remote, and push the code without requiring GitHub CLI.

The portal offers App Service starter templates for full-stack Next.js apps and runtime-specific API starters. Each template explains when to use it and declares whether PostgreSQL and Microsoft Entra login are available.

The current generated templates are Next.js Web App and Python FastAPI. FastAPI starts compact by default and can opt into PostgreSQL and Microsoft Entra login when an API needs data or Cedarville sign-in. Python `http.server` is supported only for imported plain static apps, not as a generated template. The generated templates include Azure-first publishing bundles:

- a minimal Next.js starter repo skeleton
- a compact Python FastAPI API starter
- Azure App Service publishing docs
- a generated deployment manifest
- a GitHub Actions deployment workflow
- a generated-app Codex publishing skill

Portal-managed Azure publishing for generated apps uses one shared resource group, one shared App Service Plan, and one shared PostgreSQL flexible server. Each published app gets its own Azure Web App. When PostgreSQL is selected, it also gets its own database on the shared server.

For generated and imported apps, the portal tracks whether publishing setup is ready. If Azure, Entra, or GitHub credentials drift or rotate, the app can offer Repair Publishing Setup to refresh portal-managed setup instead of blindly retrying with stale configuration.

The `My Apps` page also supports scoped deletion. A user can delete the portal record and ZIP artifact, the managed GitHub repository, and the app-specific Azure deployment independently. Azure deletion removes the app Web App and, when PostgreSQL was selected for that app, that app's PostgreSQL database only; it does not delete the shared PostgreSQL flexible server.

The portal supports an admin and collaboration model for managing shared app work. Admins can manage portal users, grant portal admin access, see all apps, reassign app owners, add collaborators, and delete scoped app resources. Each app keeps one primary owner, while collaborators can download app artifacts, request GitHub access, and publish app changes.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Configure PostgreSQL and Microsoft Entra ID values.
3. If you want managed repo creation to run during app generation, also configure the GitHub App values in `.env`.
4. Run `npm install`.
5. Run `npm run db:up`.
6. Run `npm run prisma:migrate:deploy`.
7. Run `npm run prisma:seed`.
8. Run `npm run dev`.

## Key Scripts

- `npm run dev` starts the Next.js development server.
- `npm run build` creates a production build.
- `npm test` runs the Vitest suite.
- `npm run test:e2e -- e2e/create-and-download.spec.ts` runs the Playwright create-and-download flow.
- `npm run prisma:seed` syncs the in-code template catalog into the database.

## Docs

- [Portal setup](docs/portal/setup.md)
- [Template authoring](docs/portal/template-authoring.md)
- [Azure publishing](docs/publishing/azure-app-service.md)
- [Portal-managed publishing design](docs/superpowers/specs/2026-04-28-portal-managed-publishing-design.md)
- [Portal Azure publish runtime design](docs/superpowers/specs/2026-04-29-portal-azure-publish-runtime-design.md)
