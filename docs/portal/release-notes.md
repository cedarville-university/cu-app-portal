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

The existing portal workflow fetches full history and runs `npm run release-notes:generate` before building. A push to `main` therefore updates the bundled notes automatically when that application deployment succeeds. Feature-branch pushes do not update the live site. A failed build or deployment leaves the live notes unchanged. No GitHub API access, database, AI service, or write token is required at runtime.

Commit dates describe when changes were recorded, rather than a separate deployment timestamp. Notes are author-supplied: automation does not translate technical subjects or invent notes for unmarked commits.

## Local development

```bash
npm run release-notes:generate
npm run dev
```

Generation combines commit entries with `src/features/release-notes/baseline.json` and writes `src/features/release-notes/generated.json`. The baseline backfills 20 dates of verified user-facing improvements from Git history. Maintenance-only dates are omitted. Future commit notes join this history, and only the latest 20 dates are displayed. The checked-in generated file supports local development and builds that do not run the generator. Production always regenerates from its own checkout before building; there is no auto-commit or second workflow run.

Run generation from a full Git checkout. Missing Git metadata, shallow history, and malformed baseline dates fail generation rather than publishing incomplete history. After authoring a new note, commit it before regenerating to preview it. The generated file may change locally; commit a refreshed snapshot when useful. Do not add a release note solely for a generated snapshot update.

Tests: `npm test -- scripts/release-notes src/features/release-notes src/app/page.test.tsx`.
