# UI GitHub profile step

**Approved behavior:** Immediately after Cedarville sign-in, offer a GitHub
username step with a skip button. Reuse saved usernames automatically. Open
`https://github.com` in a new tab so someone can sign in or create an account,
find their username, and return to CU Launch.

**Design:** Reuse the current login and form styling. Route UI sign-in through
`/onboarding/github`, preserving a safe original destination. Users with a
saved username pass through immediately. Others see an explanation, one input,
**Save and continue**, **Open GitHub**, and **Skip for now**. Skip continues this
sign-in without saving anything; a later sign-in can offer the step again if
the username remains missing. Settings and existing app-specific access steps
remain available. The plugin's bearer authentication is unaffected.

**Implementation:** Add a shared return-path utility, authenticated setup page,
client form, and server action. Use the existing username validator and save
only the current user's GitHub username; do not change notifications or grant
repository access. All UI sign-in entry points, including collaboration
invitations, use the same post-sign-in route. No database migration is needed.

- [x] Add failing tests for safe return paths, sign-in routing, missing/saved
  profiles, save/skip controls, validation, authentication, and actor-only saves.
- [x] Implement routing, page, form, and action with visible recoverable errors.
- [x] Verify GitHub opens separately and skipped or completed setup resumes the
  original destination, including invitation and app links.
- [x] Update README and portal setup guidance; preserve the separately maintained
  downloadable user-guide/PDF artifacts.
- [x] Run focused tests and the production build; inspect desktop/mobile UI and
  verify the skip/save paths without contacting GitHub or creating repositories.

**Review focus:** No open redirects or sign-in loops; no identity inference;
skip is available without entering a username; existing saved profiles are not
overwritten on page load; no plugin or production auth-bypass changes.

## Verification

- New tests failed before implementation; 43 focused routing/action/page tests
  then passed. The full Vitest suite passed 1,708 tests with one existing skip.
- Production build passed, including `/onboarding/github`.
- All six local Playwright onboarding tests passed. Updated stale browser test
  selectors for the existing home/template flow and published-app details link;
  those product pages were not changed.
- Browser coverage verifies empty-input skip without a profile write, invalid
  input feedback and retention, save/readback in Settings, saved-profile bypass,
  the GitHub new-tab link, and mobile overflow. Desktop and mobile screenshots
  were inspected. Actual Microsoft Entra sign-in remains a live verification
  step; the browser suite uses the existing test-only bypass.
- Independent review found no material issues. The design detector found no
  issues in the new page/form; global stylesheet warnings were pre-existing.
- Release-note generation ran while preserving the user's existing preview
  edit. At the implementation handoff no commit, push, or deployment had been
  performed; the user subsequently authorized committing, pushing, and deploying
  this feature through the existing CU Launch workflow.

Suggested release note for integration:

Release-note: After signing in, you can save your GitHub username for future apps or skip and add it later.
