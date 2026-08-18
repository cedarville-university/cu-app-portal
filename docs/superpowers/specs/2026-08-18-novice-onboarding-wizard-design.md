# Novice App Onboarding Wizard Design

## Status

Approved in conversation on August 18, 2026.

## Context

The Cedarville App Portal already creates generated apps, imports existing
GitHub apps, creates managed repositories for local-only apps, prepares
repositories for Azure, and publishes apps. Those capabilities currently meet
on the full app-details page, which exposes too many concepts and actions at
once for a first-time user.

The first onboarding implementation introduced dedicated wizard pages but did
not fully align the UI with the underlying repository and publishing state
machines. Generated apps still started publishing automatically, local-only
apps could not advance, imported apps could display actions that their server
actions would reject, collaborators could see the owner's GitHub username, and
the full details page remained the primary escape path before publication.

The primary audience for this redesign is a Cedarville employee with little or
no knowledge of coding, GitHub, Git, Azure, or application publishing. The
portal must provide unusually explicit guidance and expose one safe next action
at a time.

## Goals

- Guide new, imported, and local-only apps from their starting point through a
  successful first Azure publication.
- Make Codex customization optional for generated starters.
- Ask about GitHub only when the selected path requires the user to access or
  change repository code.
- Derive the current step from durable backend state so the wizard survives
  refreshes and can be resumed from My Apps.
- Show only actions accepted by the corresponding server-side state guards.
- Translate failures and recovery actions into plain language.
- Reserve the complete app-details screen for successfully published apps.
- Give Codex prompts enough context to guide a novice without asking them to
  operate Git or a terminal manually.

## Non-Goals

- Replacing the existing repository, preparation, or publishing services.
- Adding a second persistent workflow or onboarding-progress model.
- Hiding technical evidence from administrators or support staff.
- Automating GitHub sign-up, invitation acceptance, or pull-request approval,
  which require the user's external account and consent.
- Removing the full app-details screen or its post-publication management
  capabilities.

## Product Principles

1. Each screen has one primary next action.
2. The portal explains why an external service is needed before asking the user
   to visit it.
3. Technical terms appear only when unavoidable and receive an immediate
   plain-language explanation.
4. The portal never displays an action that the server will reject for the
   current state.
5. Failure screens answer three questions: what happened, what the portal can
   do next, and when the user should contact support.
6. A user can leave and resume without remembering what step they completed.
7. Generated starters can be published without creating a personal GitHub
   account or using Codex.

## Entry Experience

The two home-page calls to action enter the wizard immediately:

- **Create New App** opens the guided template chooser.
- **Add Existing App** first asks whether the code is already on GitHub or is
  only on the user's computer.

The generic `/onboarding` entry remains a recovery route that asks where the
app is starting. Direct `/create` and `/apps/add` routes remain compatible, but
their successful submissions enter request-specific onboarding.

## Generated App Journey

1. The user chooses a template and enters the requested app information.
2. The portal creates the app and managed repository. It does not publish.
3. The wizard confirms that the repository is ready and offers two choices:
   - **Publish the starter now**
   - **Customize it with Codex first**
4. Publishing the starter skips personal GitHub setup and advances to Azure
   publishing.
5. Customizing first checks the signed-in user's GitHub username:
   - If no username is stored, explain GitHub and ask whether the user already
     has an account.
   - If not, link to GitHub sign-up and tell the user exactly what information
     to return with.
   - Save the current actor's username and request repository access.
   - If GitHub sends an invitation, explain how to open and accept it.
6. Show a novice-oriented Codex prompt and a single copy button.
7. Tell the user to return after Codex says the changes were pushed. Publishing
   remains available because customization is optional and cannot be reliably
   inferred from repository status.
8. Queue the first Azure publish only when the user explicitly clicks the
   publish action.

## Existing GitHub App Journey

1. Ask for the GitHub repository address, app name, and a short description.
2. Copy the repository into the managed Cedarville organization when needed.
3. If repository import fails, show the recorded explanation, support
   reference, and a **Start again with this repository** link. The add form is
   prefilled from the stored source URL and app name, and a new import request
   chooses a fresh managed target name. The wizard does not retry against a
   possibly partial target repository or delete that repository automatically.
4. Offer **Prepare my app for publishing**. The default is direct preparation
   because it is the simplest path and the preparation service refuses to
   overwrite conflicting publishing files.
5. Represent each preparation state explicitly:
   - `PENDING_USER_CHOICE`: offer automatic preparation.
   - `RUNNING`: show progress and no submit button.
   - `FAILED`: show the safe retry action using the recorded preparation mode.
   - `BLOCKED` plus `CONFLICTED`: explain that existing publishing files need
     review, ensure the current user can access GitHub, and offer a review
     request instead of direct preparation.
   - `PULL_REQUEST_OPENED`: show the review link, explain how to approve and
     merge it, and offer **I've approved the changes** to verify readiness.
   - `COMMITTED`: advance to publishing-setup status.
6. If publishing setup is ready, offer the first publish. If it needs repair,
   offer the existing repair action with beginner-friendly wording. While it is
   checking or repairing, show progress without an invalid action.

## Local-Only App Journey

1. Ask for the local app name and description, then create an empty managed
   repository.
2. Guide the signed-in user through GitHub account creation and repository
   access because uploading and later editing local code requires that access.
3. Provide a Codex prompt that tells Codex to inspect the local folder,
   initialize Git only when necessary, preserve existing remotes and commits,
   connect the managed repository, push the code, and report completion in
   plain language.
4. The user clicks **My code has been uploaded** only after Codex reports a
   successful push. That action invokes repository preparation in direct mode.
5. The same preparation state handling used by existing GitHub apps handles
   unsupported apps, failures, conflicts, review requests, and verification.
6. Successful preparation advances through publishing setup and first publish.

## State-Derivation Architecture

Add a pure `src/features/onboarding/state.ts` module. It accepts only the
fields required from the app request, repository import, current actor, and
optional short-lived path choice. It returns a discriminated union describing
the single current presentation state and its allowed actions.

Expected high-level states are:

- `REPOSITORY_PENDING`
- `REPOSITORY_FAILED`
- `GENERATED_PATH_CHOICE`
- `GITHUB_ACCOUNT_REQUIRED`
- `GITHUB_INVITATION_PENDING`
- `CODEX_CUSTOMIZATION`
- `LOCAL_CODE_UPLOAD`
- `PREPARATION_READY`
- `PREPARATION_RUNNING`
- `PREPARATION_FAILED`
- `PREPARATION_CONFLICT`
- `PREPARATION_REVIEW_OPEN`
- `PUBLISHING_SETUP_CHECKING`
- `PUBLISHING_SETUP_REPAIR_REQUIRED`
- `READY_TO_PUBLISH`
- `PUBLISHING`
- `PUBLISH_FAILED`
- `PUBLISHED`

The state helper will reuse or mirror shared server predicates rather than
creating looser UI-only checks. Where a predicate controls both UI and server
authorization, it should be extracted into a shared module and tested once.

The state helper does not persist transient choices. A generated app with no
GitHub access begins at `GENERATED_PATH_CHOICE`. Choosing immediate publishing
submits the publish action. Choosing customization carries a short-lived route
choice until requesting GitHub access; after that, repository-access state
durably identifies the customization branch.

## Current Actor and Authorization

The request-specific onboarding page continues using `appAccessWhere`, so
owners, collaborators, and admins retain their existing permissions. It must
query the signed-in actor independently from the app owner. GitHub forms use
the actor's username and never prefill another user's username.

Server actions remain the final authorization boundary. The wizard may explain
why an action is unavailable, but it must not weaken owner, collaborator, or
admin permissions.

## Publishing and Recovery

Generated creation always uses `createOnly`; the initial publish begins only
from the wizard. Imported apps can publish only when preparation is `COMMITTED`
and publishing setup is `READY`. Generated apps follow their existing allowed
setup states.

Publishing presentation follows the same rules as the existing detailed page:

- `NOT_STARTED`: show publish only when all prerequisites pass.
- `QUEUED`, `PROVISIONING`, or `DEPLOYING`: show progress and a link to any
  available deployment log, but no duplicate publish button.
- `FAILED`: show the user-safe error summary and both retry and repair when
  those actions are valid.
- `SUCCEEDED`: redirect to the complete app-details page.
- `DELETED`: explain that the deployment was removed and direct the user to My
  Apps or support.

Publishing setup statuses receive distinct UI:

- `NOT_CHECKED` or `CHECKING`: explain that the portal is checking settings.
- `READY`: allow publishing when repository requirements also pass.
- `NEEDS_REPAIR` or `BLOCKED`: offer repair and explain that it does not delete
  code or Azure resources.
- `REPAIRING`: show progress only.

Errors display the app's support reference in an optional help section. Raw
provider messages remain available only where they are already user-safe.

## Full Details and Navigation

My Apps chooses its destination per request:

- Published apps link to `/download/[requestId]`, the existing complete app
  details page.
- Unpublished apps link to `/onboarding/[requestId]` with a label such as
  **Continue setup**.

The request-specific onboarding page does not link to advanced details before
publication. The complete details route redirects non-admin users back to
onboarding while the app is unpublished. Administrative routes remain
available for support and recovery.

After `SUCCEEDED`, onboarding displays a brief success handoff and links to the
complete details page. The details page retains collaboration, environment
variables, auto-deploy, public listing, repair, republish, and deletion.

## Novice-Facing Content Pattern

Each state renders:

1. A progress indicator with completed, current, and upcoming stages.
2. A heading written as an outcome, not a system status.
3. Two or three sentences explaining what is happening and why.
4. One primary action.
5. A short **What happens next?** note.
6. Optional **Technical details for support** disclosure.

Database enum values and infrastructure terms are not displayed directly.
When terms such as GitHub, repository, Azure, or review request first appear,
the page defines them in the user's context.

## Codex Prompt Requirements

Both generated/imported and local-only prompts tell Codex:

- The user is a beginner and should not be asked to operate a terminal or type
  Git commands.
- Inspect the repository or local project before changing anything.
- Explain the immediate goal in ordinary language.
- Perform safe local commands and Git operations directly.
- Preserve existing files, commits, branches, and remotes.
- Use the portal-managed repository as the publishing source of truth.
- Ask one question at a time only when a user decision is genuinely required.
- Pause before any sign-in, invitation acceptance, credential prompt, or other
  step that only the user can complete; provide exact instructions.
- Never request portal, GitHub, Azure, or Cedarville passwords or secrets.
- Follow the generated portal skill and deployment manifest.
- Run relevant tests after modifications.
- Commit and push finished changes to the managed repository.
- Confirm the repository and branch that received the push.
- End by telling the user to return to the Cedarville App Portal and name the
  exact button to click next.

The UI explains how to use the prompt: open the local project in Codex when
appropriate, paste the prompt, let Codex work, follow only the sign-in steps it
cannot perform, and return after Codex reports success.

## Component Boundaries

- `src/features/onboarding/state.ts`: pure state derivation and shared action
  eligibility.
- `src/features/onboarding/state.test.ts`: exhaustive table-driven state tests.
- `src/features/onboarding/step-shell.tsx`: consistent progress, explanation,
  next-action, and support-details presentation.
- `src/app/onboarding/page.tsx`: pre-request routing questions.
- `src/app/onboarding/[requestId]/page.tsx`: data loading and state-specific
  composition.
- Existing repository, preparation, repair, and publishing actions remain the
  mutation layer; only missing safe retry or redirect behavior is added.
- `src/features/repositories/codex-handoff.ts`: novice-oriented prompt content.

The request-specific page should stay readable by delegating state-specific UI
to focused components rather than accumulating another details-page-sized
conditional tree.

## Testing Strategy

Implementation follows test-driven development. Each production behavior gets
a failing test before its implementation.

Required coverage:

- Table-driven tests for every onboarding state and invalid-state exclusion.
- Generated template submission creates without publishing.
- Generated immediate-publish and customize-first branches.
- GitHub account guidance and actor-specific username behavior.
- Local upload advancing into preparation.
- Preparation pending, running, failed, conflicted, review-open, verified, and
  committed states.
- Publishing setup checking, ready, repair-required, and repairing states.
- Publish queued, provisioning, deploying, failed, succeeded, and deleted
  states.
- My Apps routes unpublished apps to onboarding and published apps to details.
- Non-admin unpublished detail access returns to onboarding.
- Updated redirect expectations for generated and imported creation.
- Codex prompt tests for beginner guidance, safety, Git operation ownership,
  test execution, push confirmation, and named portal return action.

Final verification includes the complete Vitest suite, production build,
targeted imported-app preparation tests, publishing setup tests, and the
relevant Playwright onboarding journey when the local dependencies are
available.

## Review Finding Coverage

1. Automatic generated publishing is removed from creation and moved to an
   explicit wizard action.
2. Local-only apps receive a post-upload preparation action and can reach
   publishing.
3. Imported preparation and publishing controls are derived from exact server
   states, including conflict review, verification, and repair.
4. GitHub usernames come from the current actor rather than the app owner.
5. The GitHub-account question appears only on a path that needs GitHub access
   and leads to distinct account guidance.
6. Redirect tests are updated and the full suite is part of the completion
   gate.
7. Unpublished apps route to onboarding; the full details screen becomes the
   post-publication management experience.

## Documentation

Update `README.md`, `docs/portal/setup.md`, and novice-facing documentation in
`docs/user/` when the implemented workflow and exact labels are final. Regenerate
the user PDFs if their Markdown sources change.
