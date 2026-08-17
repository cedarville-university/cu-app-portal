# Cedarville App Portal

Internal portal for Cedarville staff to create managed GitHub repositories from approved templates and publish them through the portal.

## What It Does

The portal signs staff in with Microsoft Entra ID, guides them through a template-backed app creation form, and creates a portal-managed GitHub repository as the canonical source of truth for supported publishing.

Users can also add an existing compatible GitHub app repository. If the source repository is outside the configured Cedarville GitHub org, the portal imports it into the shared org while preserving history, scans and prepares it for supported Azure App Service runtimes, and lets the user choose either direct publishing additions or a review PR. Current import support covers root Next.js apps, Express apps, Python FastAPI apps, and plain static Python `http.server` apps with a root `index.html`.

For apps developed locally with Codex that are not on GitHub yet, the portal can create an empty managed repository in the shared org first. The app details page then provides Codex-ready git instructions to initialize the local project when needed, add the managed repository as a remote, and push the code without requiring GitHub CLI.

The portal offers App Service starter templates as user-facing choices. Recommended Templates describe common non-technical starting points such as Department Form + Approval, Simple Data Tracker, and Public Information Page. Developer Starters keep lower-level Custom Web App and API / Automation Service options available for more technical work. Each template explains when to use it and declares whether PostgreSQL and Microsoft Entra login are available.

The current generated templates reuse shared Next.js and Python FastAPI engines. Non-technical presets can point at the shared Next.js source while keeping their own names, descriptions, and feature defaults. FastAPI starts compact by default and can opt into PostgreSQL and Microsoft Entra login when an API needs data or Cedarville sign-in. Python `http.server` is supported only for imported plain static apps, not as a generated template. The generated templates include Azure-first publishing bundles:

- a minimal Next.js starter repo skeleton
- a compact Python FastAPI API starter
- Azure App Service publishing docs
- a generated deployment manifest
- a GitHub Actions deployment workflow
- a generated-app Codex publishing skill

Portal-managed Azure publishing for generated apps uses one shared resource group, one shared App Service Plan, and one shared PostgreSQL flexible server. Each published app gets its own Azure Web App. When PostgreSQL is selected, it also gets its own database on the shared server.

For generated and imported apps, the portal tracks whether publishing setup is ready. If Azure, Entra, or GitHub credentials drift or rotate, the app offers Repair Publishing Setup to refresh portal-managed setup. Failed deployments present both Retry Publish and Repair Publishing Setup so the user can choose whether to rerun deployment or repair prerequisites first.

The `My Apps` page also supports scoped deletion. A user can delete the portal record, the managed GitHub repository, and the app-specific Azure deployment independently. Azure deletion removes the app Web App and, when PostgreSQL was selected for that app, that app's PostgreSQL database only; it does not delete the shared PostgreSQL flexible server.

The portal supports an admin and collaboration model for managing shared app work. Admins can manage portal users, grant portal admin access, see all apps, reassign app owners, add collaborators, and delete scoped app resources. Each app keeps one primary owner, while collaborators can access app details, request GitHub access, and publish app changes.

The portal sends immediate SMTP email notifications for app lifecycle, collaboration, and publishing events. Users can manage notification preferences from Settings, while collaboration invite emails always send because they grant access. Owners and admins can invite Cedarville coworkers by email; invitees must accept through Entra before they become collaborators. Owners and admins can also remove accepted collaborators from the app details screen (portal access is removed immediately; GitHub repository access is revoked best-effort when a managed repo and username exist).

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
- `npm run prisma:seed` syncs the in-code template catalog into the database.
- `npm run docs:pdf` regenerates the downloadable user documentation from `docs/user/` after the Python requirements in `scripts/docs/requirements.txt` are installed.

## Docs

- [Portal setup](docs/portal/setup.md)
- [Technical operations and support](docs/portal/technical-operations.md)
- [Template authoring](docs/portal/template-authoring.md)
- [User documentation maintenance](docs/user/README.md)
- [Azure publishing](docs/publishing/azure-app-service.md)
- [Portal-managed publishing design](docs/superpowers/specs/2026-04-28-portal-managed-publishing-design.md)
- [Portal Azure publish runtime design](docs/superpowers/specs/2026-04-29-portal-azure-publish-runtime-design.md)
