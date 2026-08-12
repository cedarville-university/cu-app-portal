# AGENTS.md

This file orients future coding agents working in this repository.

## Project

This repository is the Cedarville App Portal.

Current scope of the implemented phase:

- Next.js + TypeScript portal
- Cedarville/Entra-oriented auth wiring
- protected `/create` and app-details flows
- template-backed app generation
- template seeding
- local docs and Playwright coverage

The app is past scaffolding and has a working create-to-managed-repository vertical slice.

## Read First

Before making substantial changes, read:

- [README.md](/Users/marchollins/projects/cu-app-portal/README.md)
- [docs/portal/setup.md](/Users/marchollins/projects/cu-app-portal/docs/portal/setup.md)
- [docs/portal/template-authoring.md](/Users/marchollins/projects/cu-app-portal/docs/portal/template-authoring.md)
- [docs/portal/handoff-2026-04-23.md](/Users/marchollins/projects/cu-app-portal/docs/portal/handoff-2026-04-23.md)
- [docs/superpowers/specs/2026-04-22-portal-v1-design.md](/Users/marchollins/projects/cu-app-portal/docs/superpowers/specs/2026-04-22-portal-v1-design.md)
- [docs/superpowers/plans/2026-04-22-portal-v1-implementation.md](/Users/marchollins/projects/cu-app-portal/docs/superpowers/plans/2026-04-22-portal-v1-implementation.md)

## Local Dev Flow

Normal local startup:

```bash
npm install
npm run db:up
npm run prisma:migrate:deploy
npm run prisma:seed
npm run dev
```

Useful checks:

```bash
npm test
npm run build
```

## Important Repo-Specific Gotchas

### Prisma env loading

`prisma.config.ts` was customized to load `.env` and `.env.local` before Prisma commands run.

This exists because Prisma commands previously failed unless `DATABASE_URL` was passed inline.

### Seed script

`npm run prisma:seed` uses:

```bash
node --env-file=.env --env-file-if-exists=.env.local --import tsx prisma/seed.ts
```

This is intentional. Do not casually switch it back to `tsx prisma/seed.ts` without verifying it still works, because direct `tsx` hit IPC/socket issues in this environment.

### E2E auth bypass

The Playwright flow uses `E2E_AUTH_BYPASS=true` from `playwright.config.ts`.

This bypass:

- short-circuits auth config before Entra env parsing
- allows local e2e runs without Cedarville SSO
- uses a narrow fallback user path in the create flow and app-details page

Treat this as test-only infrastructure, not a production auth approach.

## Key Files

Core flow:

- [src/app/create/actions.ts](/Users/marchollins/projects/cu-app-portal/src/app/create/actions.ts)
- [src/features/generation/build-source-snapshot.ts](/Users/marchollins/projects/cu-app-portal/src/features/generation/build-source-snapshot.ts)
- [src/auth/config.ts](/Users/marchollins/projects/cu-app-portal/src/auth/config.ts)
- [prisma/seed.ts](/Users/marchollins/projects/cu-app-portal/prisma/seed.ts)
- [src/features/templates/catalog.ts](/Users/marchollins/projects/cu-app-portal/src/features/templates/catalog.ts)

## Current Product State

Working today:

- portal runs locally
- create flow works
- source snapshots are sent directly to GitHub during repository creation
- seeded template catalog works
- app details page works
- end-to-end Playwright proof exists

Not yet a full product:

- no “My Apps” history/management UI
- no browse/shared-apps experience
- limited failure UX and recovery flows
- local/test auth story is functional but intentionally temporary in places

## Recommended Next Areas

The most natural next features are:

1. `My Apps` / request history
2. better generation and repository setup failure UX
3. richer request metadata on the app details page
4. template authoring improvements and more templates
5. production hardening around repositories, retention, and audits

## Working Style Expectations

- Preserve existing user changes; do not revert unrelated work.
- Prefer targeted tests and `npm run build` before claiming success.
- If you touch auth, create flow, repository setup, seeding, or e2e config, rerun the relevant checks.
- If you change local setup behavior, update the docs in `README.md` and `docs/portal/`.

## Milestone Commits

Recent commits that matter for orientation:

- `d8cb8f8` setup and template authoring docs
- `24de22c` template seeding and user sync
- `3aff0c9` template rendering primitives
- `8b99139` Prisma env-loading and seed script fix
