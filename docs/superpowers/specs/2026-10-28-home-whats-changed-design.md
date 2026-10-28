# Home page release notes

## Intent

Give CU Launch users a dated, plain-language account of improvements without exposing technical commit messages. The section appears at the end of the home page, immediately above the shared footer.

## Approach

The user selected plain-language `Release-note:` entries in Git commits, automatically collected during deployment. AI summaries of arbitrary commit messages were considered but would introduce a service dependency and less reliable wording. A manually maintained page alone would not meet the requested automatic updates.

## Behavior

- Render a “What’s changed” section beneath “How it works,” visible to every home page visitor.
- Show the latest 20 dates containing release notes, newest first, with bulleted entries under each date in a vertically scrollable list. Keep the list at a bounded, responsive height so the section does not make the home page excessively long. Make the scroll region keyboard accessible with a visible focus indicator and an accessible name. Use America/New_York calendar dates derived from commit timestamps.
- Accept one or more single-line `Release-note: <user-facing improvement>` entries in each commit message. Ignore unmarked commits and duplicate notes on the same date. Do not display hashes, authors, raw subjects, or technical metadata.
- Build the release-note data from the checked-out Git history before the Next.js production build in the existing main-branch deployment workflow. Fetch sufficient history explicitly. Include only commits reachable from that checkout; use first-parent history to avoid duplicate branch history and require squash/merge commit notes when merging.
- Bundle the generated data with the app. Runtime requests require neither Git nor GitHub access. A successful deployment makes the notes visible with the corresponding application changes; failed deployments preserve the existing site and notes.
- Seed a small set of recent, verified improvements in a versioned baseline so the initial section is useful. Historical commits need no rewriting. Marked future commits augment that baseline.
- Document the format, merge expectations, local generation, and deployment behavior. Add contributor guidance for user-visible changes.

## Scope and constraints

Use the existing Next.js, TypeScript, CSS, and GitHub Actions stack. No new service, database schema, AI integration, per-user read tracking, or notification system is needed. Notes are intentionally authored; unmarked changes are omitted.

## Builder choices and validation

The user requested the 20 most recent dates in a scrollable list. First-parent history, the baseline, and date grouping remain proposed implementation choices. Match existing colors and spacing, use semantic headings and time elements, and support narrow screens. Test parsing, date boundaries, deduplication, ordering, empty/malformed entries, Git history behavior, workflow generation ordering, home-page rendering, and keyboard access to the scroll region. Run the targeted tests and a production build before claiming completion.
