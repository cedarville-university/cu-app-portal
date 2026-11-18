# Home page release notes

“What’s changed” appears after “How it works,” directly above the home page footer. It displays the 20 most recent dates that contain notes, newest first, in a keyboard-accessible scrollable list. Dates use the commit's committer timestamp converted to America/New_York. Multiple improvements on the same date share one heading.

## Author a note

For each user-visible improvement or fix, add a single-line entry to the commit message body:

```text
Improve publishing recovery

Release-note: If publishing fails, you can open app details to adjust your settings before trying again.
```

Use `Release-note:` exactly, starting at the beginning of the line. Multiple entries are allowed. Each entry must fit on one line; continuation lines are not included. Use plain language describing the user's benefit. Do not include secrets, internal identifiers, technical details, or raw troubleshooting output. Notes render as text, so Markdown and HTML are unnecessary.

Internal maintenance, dependency updates, and refactoring that do not change the user experience can omit the entry. Unmarked commit subjects are never published. Identical notes on the same date are deduplicated.

## Merge and deployment behavior

The generator reads only first-parent history reachable from the checked-out commit. When squashing or merging a feature branch, carry its release notes into the final squash or merge commit message. Ordinary fast-forward commits are included directly. This avoids publishing both branch notes and their merge summary.

The existing portal workflow fetches full history and runs `npm run build`, whose `prebuild` hook generates the release notes before building. A push to `main` therefore updates the bundled notes automatically when that application deployment succeeds. Feature-branch pushes do not update the live site. A failed build or deployment leaves the live notes unchanged. No GitHub API access, database, AI service, or write token is required at runtime.

Commit dates describe when changes were recorded, rather than a separate deployment timestamp. Notes are author-supplied: automation does not translate technical subjects or invent notes for unmarked commits.

## Local development

```bash
npm run dev
```

Generation combines commit entries with `src/features/release-notes/baseline.json` and writes `.generated/release-notes.json` at the repository root, outside `src/`. The `.generated/` directory is ignored by Git and must not be committed. The baseline backfills 20 dates of verified user-facing improvements from Git history. Maintenance-only dates are omitted. Future commit notes join this history, and only the latest 20 dates are displayed. `npm run dev` and `npm run build` generate the file automatically through portal-only npm lifecycle hooks, including on a fresh checkout. Shared tests use fixed release-note fixtures through Vitest configuration; neither `npm test` nor worker build commands generate portal artifacts or require full repository history. Production regenerates from its own checkout before building and bundles the JSON through the home page import; it does not need Git or the generated directory at runtime. There is no auto-commit or second workflow run.

Run generation from a full Git checkout. Missing Git metadata, shallow history, and malformed baseline dates fail generation rather than publishing incomplete history. After authoring a new note, commit it before regenerating to preview it. You can also run `npm run release-notes:generate` directly to refresh the ignored local file. Regeneration creates no tracked file changes. If invoking Next.js directly instead of using npm scripts, run the generation command first. Vitest uses fixed fixtures and needs no generation step.

Tests: `npm test -- scripts/release-notes src/features/release-notes src/app/page.test.tsx`.
