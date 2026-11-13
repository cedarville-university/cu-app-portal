# CU Launch plugin GitHub onboarding

## Intent

When someone creates an app through the CU Launch plugin, Codex should reuse
their saved GitHub username, collect and save it only when missing, and handle
repository invitations with minimal user involvement. Local repository setup
must provide the same Git author and authentication guidance as UI handoffs.

## Approach

Extend the existing delegated MCP API and repository-access service. An
instructions-only change cannot read or save a user's own GitHub profile today;
using administrator search would exclude ordinary users and expose unnecessary
directory information. A separate GitHub account-linking system is unnecessary
for the requested saved-username workflow.

The proposed implementation adds two narrowly scoped tools:

- `get_my_profile`: return the authenticated actor's saved GitHub username,
  portal email, and display name. Resolve the actor on the server; accept no
  target-user identifier. Read the current database record on each call.
- `set_my_github_username`: validate and save a username on that same actor's
  existing CU Launch user record. Use a stable idempotency UUID, an actor-scoped
  write rate limit, and a profile-update audit event. Change no other settings.

No database migration is needed because `User.githubUsername` already exists.

## Plugin behavior

1. Read the profile during app creation. Reuse a nonempty saved username without
   asking the user to provide or reconfirm it. Do not infer a username from an
   email address, local Git settings, another app's owner, or a connected GitHub
   account.
2. When missing, ask for the GitHub username in plain language, explaining that
   CU Launch will remember it. Save the supplied username through the new tool
   before requesting access. Help someone without an account create one when
   needed; do not invent an identity.
3. Include repository access for that username in the existing launch summary.
   Once creation is approved and the managed repository is ready, automatically
   call `request_github_access` with its own stable UUID. Do not add another
   confirmation solely for the invitation. Keep access separate from creation
   so an access failure cannot cause duplicate app creation or hide success.
4. Treat `INVITED` as pending. Give the managed repository invitation link and
   ask the user only to complete acceptance in the intended GitHub account.
   Do not repeatedly send access requests while waiting.
5. After the user confirms acceptance, deliberately run one new access check
   through the existing access service with a new operation UUID. That service
   returns `GRANTED` when GitHub confirms existing access. Reuse this check's
   UUID if its transport response is uncertain. `get_app` alone reads recorded
   audit state and must not be described as a fresh acceptance check.
6. Keep pending, granted, and failed results actor-specific. Preserve app-access
   checks, the saved-username match, the grant ledger, and collaborator revocation.
   A username is a saved preference, not proof of GitHub authentication.

## Local Git parity

Bring the workspace plugin skill into line with the existing instructions in
`src/features/repositories/codex-handoff.ts`:

- Verify the intended local Codex project, its primary folder, and `git --version`.
  Preserve existing work and remotes; use HTTPS.
- If Git is missing, provide the managed Windows Company Portal or macOS
  Cedarville IT instructions and have the user reopen Codex afterward.
- Set and verify repository-local `user.name` from the saved GitHub username
  and `user.email` from the portal email before commits or merge-producing pulls.
  Treat both as literal data and quote arguments safely.
- Own authentication recovery: existing Git authentication, credential-helper
  diagnosis and scoped GCM repair, available GitHub plugin tools, then the
  official GitHub CLI with secure sign-in when necessary. Remove the workspace
  skill's conflicting blanket prohibition on those fallback tools.
- Preserve credentials and unrelated settings. Avoid global configuration
  changes; never solicit or expose credentials. Git author settings and plugin
  access do not authenticate local Git. Verify the actual requested push.

## Boundaries and verification

Keep the portal UI's starter-or-customize behavior unchanged. Launch approval
does not authorize publishing, repair, retry, deletion, or broader access.
Explain existing auto-deploy behavior before a default-branch push to a
published app.

Test self-only profile reads/writes, validation, actor isolation, rate limiting,
stable replay, tool registration, and safe errors. Cover saved and missing
usernames, automatic invitation sequencing, pending/accepted invitations,
access failure after successful creation, and local Git guidance parity.
Run the relevant MCP, repository-access, and handoff tests plus the production
build. Refresh release-note preview data while preserving existing user edits.

Update the workspace plugin source/version and operations documentation.
Source changes and local verification are distinct from deployment and an
installed plugin metadata/skill refresh; report which actually occurred.
