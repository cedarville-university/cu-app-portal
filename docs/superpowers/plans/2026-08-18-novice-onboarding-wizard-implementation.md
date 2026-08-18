# Novice App Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the initial all-at-once publishing experience with a resumable, state-driven wizard that safely guides novice users through generated, imported, and local-only app publication.

**Architecture:** A pure onboarding state resolver maps existing Prisma workflow fields to one discriminated UI state. Focused server-rendered step components consume that state and bind only server actions valid for it; no onboarding database model is added. Generated creation stops before publishing, unpublished My Apps entries resume onboarding, and the complete app-details page becomes the post-publication management surface.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma/PostgreSQL, Vitest, Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-08-18-novice-onboarding-wizard-design.md`

## Global Constraints

- The primary audience has little or no knowledge of coding, GitHub, Git, Azure, or application publishing.
- Every wizard state exposes one primary next action and only actions accepted by the matching server guard.
- Generated starters may publish without a personal GitHub account or Codex customization.
- GitHub usernames always come from the signed-in actor, never implicitly from the app owner.
- Do not add a Prisma model or migration for onboarding progress.
- Do not expose raw Prisma enum names in novice-facing copy.
- Do not remove or weaken existing owner, collaborator, or admin authorization.
- Preserve test-only `E2E_AUTH_BYPASS=true` behavior.
- Update `README.md`, `docs/portal/`, and `docs/user/` when workflow labels are final.

---

## File Structure

### New files

- `src/features/onboarding/state.ts` — pure workflow-state resolver and shared presentation types.
- `src/features/onboarding/state.test.ts` — table-driven coverage of every valid workflow state.
- `src/features/onboarding/step-shell.tsx` — consistent novice step framing.
- `src/features/onboarding/step-shell.test.tsx` — accessibility and copy-structure coverage.
- `src/features/onboarding/progress-refresh.tsx` — refreshes transient publishing states without user polling knowledge.
- `src/app/onboarding/[requestId]/page.test.tsx` — request-specific wizard integration coverage.
- `src/features/publishing/eligibility.ts` — publish rules shared by UI state and server actions.
- `src/features/publishing/eligibility.test.ts` — initial, republish, and retry eligibility coverage.
- `e2e/onboarding.spec.ts` — generated starter wizard browser proof.

### Modified files

- `src/features/create-app/submit-button.tsx` and test — create without publishing.
- `src/app/create/actions.ts` — remove automatic first-publish behavior.
- `src/app/onboarding/page.tsx` and test — novice entry branching.
- `src/app/onboarding/[requestId]/page.tsx` — compose state-specific steps.
- `src/features/repositories/codex-handoff.ts` and test — beginner-owned Codex workflow.
- `src/features/repositories/actions.ts` — revalidate onboarding consistently.
- `src/features/repository-imports/actions.ts` and test — onboarding redirects and preparation recovery.
- `src/features/publishing/actions.ts` and test — consume shared publish eligibility and revalidate onboarding.
- `src/features/publishing/setup/actions.ts` and test — revalidate onboarding after repair.
- `src/app/apps/page.tsx` and test — continue-setup versus app-details links.
- `src/app/download/[requestId]/page.tsx` and test — redirect unpublished non-admin users.
- `src/middleware.ts` and test — protect onboarding routes.
- `src/app/globals.css` — wizard states and responsive presentation.
- `README.md`, `docs/portal/setup.md`, `docs/user/quick-start.md`, and generated PDFs — final workflow documentation.

---

### Task 1: Define the Onboarding State Resolver

**Files:**
- Create: `src/features/onboarding/state.ts`
- Create: `src/features/onboarding/state.test.ts`
- Create: `src/features/publishing/eligibility.ts`
- Create: `src/features/publishing/eligibility.test.ts`
- Modify: `src/features/publishing/actions.ts`
- Test: `src/features/publishing/actions.test.ts`

**Interfaces:**
- Consumes: existing repository, repository-import, publishing-setup, and publish status strings.
- Produces: `deriveOnboardingState(input: OnboardingStateInput): OnboardingState` and `canQueuePublish(input, options): boolean`.

- [ ] **Step 1: Write table-driven failing tests for generated states**

```ts
import { describe, expect, it } from "vitest";
import { deriveOnboardingState, type OnboardingStateInput } from "./state";

const generatedReady: OnboardingStateInput = {
  sourceOfTruth: "PORTAL_MANAGED_REPO",
  repositoryStatus: "READY",
  repositoryUrl: "https://github.com/cedarville-it/campus-app",
  repositoryAccessStatus: "NOT_REQUESTED",
  importStatus: null,
  preparationStatus: null,
  preparationMode: null,
  compatibilityStatus: null,
  publishingSetupStatus: "NOT_CHECKED",
  publishStatus: "NOT_STARTED",
  isLocalSource: false,
  pathChoice: null,
};

describe("deriveOnboardingState generated apps", () => {
  it.each([
    [{ ...generatedReady, repositoryStatus: "PENDING" }, "REPOSITORY_PENDING"],
    [{ ...generatedReady, repositoryStatus: "FAILED" }, "REPOSITORY_FAILED"],
    [generatedReady, "GENERATED_PATH_CHOICE"],
    [{ ...generatedReady, pathChoice: "starter" }, "READY_TO_PUBLISH"],
    [{ ...generatedReady, pathChoice: "customize" }, "GITHUB_ACCOUNT_REQUIRED"],
    [{ ...generatedReady, repositoryAccessStatus: "INVITED" }, "GITHUB_INVITATION_PENDING"],
    [{ ...generatedReady, repositoryAccessStatus: "GRANTED" }, "CODEX_CUSTOMIZATION"],
  ] satisfies Array<[OnboardingStateInput, string]>)(
    "maps %# to %s",
    (input, expected) => expect(deriveOnboardingState(input).kind).toBe(expected),
  );
});
```

- [ ] **Step 2: Run the generated-state test and verify RED**

Run: `npm test -- src/features/onboarding/state.test.ts`

Expected: FAIL because `state.ts` does not exist.

- [ ] **Step 3: Write failing tests for imported, local, setup, and publish states**

Add cases asserting:

```ts
it.each([
  [imported({ importStatus: "FAILED" }), "IMPORT_FAILED"],
  [imported({ preparationStatus: "PENDING_USER_CHOICE" }), "PREPARATION_READY"],
  [imported({ preparationStatus: "RUNNING" }), "PREPARATION_RUNNING"],
  [imported({ preparationStatus: "FAILED" }), "PREPARATION_FAILED"],
  [imported({ preparationStatus: "BLOCKED", compatibilityStatus: "CONFLICTED" }), "PREPARATION_CONFLICT"],
  [imported({ preparationStatus: "PULL_REQUEST_OPENED" }), "PREPARATION_REVIEW_OPEN"],
  [imported({ preparationStatus: "COMMITTED", publishingSetupStatus: "NOT_CHECKED" }), "PUBLISHING_SETUP_NOT_STARTED"],
  [imported({ preparationStatus: "COMMITTED", publishingSetupStatus: "READY" }), "READY_TO_PUBLISH"],
  [imported({ preparationStatus: "COMMITTED", publishingSetupStatus: "NEEDS_REPAIR" }), "PUBLISHING_SETUP_REPAIR_REQUIRED"],
  [local({ preparationStatus: "PENDING_USER_CHOICE", repositoryAccessStatus: "GRANTED" }), "LOCAL_CODE_UPLOAD"],
  [generated({ publishStatus: "QUEUED" }), "PUBLISHING"],
  [generated({ publishStatus: "PROVISIONING" }), "PUBLISHING"],
  [generated({ publishStatus: "DEPLOYING" }), "PUBLISHING"],
  [generated({ publishStatus: "FAILED" }), "PUBLISH_FAILED"],
  [generated({ publishStatus: "SUCCEEDED" }), "PUBLISHED"],
  [generated({ publishStatus: "DELETED" }), "PUBLISH_DELETED"],
])("maps workflow state %# to %s", (input, expected) => {
  expect(deriveOnboardingState(input).kind).toBe(expected);
});
```

- [ ] **Step 4: Implement the minimal discriminated union and resolver**

```ts
export type OnboardingPathChoice = "starter" | "customize" | null;

export type OnboardingStateInput = {
  sourceOfTruth: string;
  repositoryStatus: string;
  repositoryUrl: string | null;
  repositoryAccessStatus: string;
  importStatus: string | null;
  preparationStatus: string | null;
  preparationMode: string | null;
  compatibilityStatus: string | null;
  publishingSetupStatus: string;
  publishStatus: string;
  isLocalSource: boolean;
  pathChoice: OnboardingPathChoice;
};

export type OnboardingState =
  | { kind: "REPOSITORY_PENDING" }
  | { kind: "REPOSITORY_FAILED" }
  | { kind: "IMPORT_FAILED" }
  | { kind: "GENERATED_PATH_CHOICE" }
  | { kind: "GITHUB_ACCOUNT_REQUIRED"; resume: "customize" | "local" | "review" }
  | { kind: "GITHUB_INVITATION_PENDING" }
  | { kind: "CODEX_CUSTOMIZATION" }
  | { kind: "LOCAL_CODE_UPLOAD" }
  | { kind: "PREPARATION_READY" }
  | { kind: "PREPARATION_RUNNING" }
  | { kind: "PREPARATION_FAILED"; retryMode: "DIRECT_COMMIT" | "PULL_REQUEST" }
  | { kind: "PREPARATION_CONFLICT" }
  | { kind: "PREPARATION_REVIEW_OPEN" }
  | { kind: "PUBLISHING_SETUP_NOT_STARTED" }
  | { kind: "PUBLISHING_SETUP_CHECKING" }
  | { kind: "PUBLISHING_SETUP_REPAIR_REQUIRED" }
  | { kind: "READY_TO_PUBLISH" }
  | { kind: "PUBLISHING" }
  | { kind: "PUBLISH_FAILED" }
  | { kind: "PUBLISH_DELETED" }
  | { kind: "PUBLISHED" };
```

Implement precedence in this exact order: published/deleted; active or failed
publish; repository failure/pending; import failure; imported/local preparation;
publishing setup; generated path choice and GitHub access. Treat `INVITED` as
pending and `GRANTED` as ready. A conflict that needs GitHub review returns
`GITHUB_ACCOUNT_REQUIRED` until access is granted, then
`PREPARATION_CONFLICT`.

- [ ] **Step 5: Extract and test shared publish eligibility**

Create `src/features/publishing/eligibility.ts` so both the server action and
state resolver consume the same guard:

```ts
export function canQueuePublish(input: {
  sourceOfTruth: string;
  repositoryStatus: string;
  preparationStatus?: string | null;
  publishingSetupStatus: string;
  publishStatus: string;
}, options: {
  allowedPublishStatuses: string[];
  allowFailedSetupRetry?: boolean;
}) {
  if (
    input.repositoryStatus !== "READY" ||
    !options.allowedPublishStatuses.includes(input.publishStatus)
  ) return false;
  if (
    input.sourceOfTruth === "IMPORTED_REPOSITORY" &&
    input.preparationStatus !== "COMMITTED"
  ) return false;
  if (options.allowFailedSetupRetry) {
    return ["NOT_CHECKED", "READY", "NEEDS_REPAIR", "BLOCKED"].includes(
      input.publishingSetupStatus,
    );
  }
  if (input.sourceOfTruth === "IMPORTED_REPOSITORY") return input.publishingSetupStatus === "READY";
  return input.publishingSetupStatus === "NOT_CHECKED" || input.publishingSetupStatus === "READY";
}
```

Test initial publish (`NOT_STARTED`), details-page republish (`SUCCEEDED`), and
failed retry (`FAILED`) separately. Use the predicate inside
`queuePublishAttempt` before the transaction with the action's existing allowed
status list and retry option. The onboarding resolver passes
`allowedPublishStatuses: ["NOT_STARTED"]`.

- [ ] **Step 6: Run state and publishing tests and verify GREEN**

Run: `npm test -- src/features/onboarding/state.test.ts src/features/publishing/eligibility.test.ts src/features/publishing/actions.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/onboarding/state.ts src/features/onboarding/state.test.ts src/features/publishing/eligibility.ts src/features/publishing/eligibility.test.ts src/features/publishing/actions.ts src/features/publishing/actions.test.ts
git commit -m "feat: derive safe onboarding states"
```

### Task 2: Stop Automatic Publishing During App Creation

**Files:**
- Modify: `src/features/create-app/submit-button.tsx`
- Modify: `src/features/create-app/template-form.test.tsx`
- Modify: `src/app/create/actions.ts`

**Interfaces:**
- Consumes: the existing template form and repository bootstrap process.
- Produces: a created app with `publishStatus: NOT_STARTED` redirected to `/onboarding/[requestId]`.

- [ ] **Step 1: Change the template-form test first**

```ts
expect(screen.getByRole("button", { name: /create app/i })).toHaveAttribute(
  "value",
  "createOnly",
);
expect(screen.queryByRole("button", { name: /create and publish/i })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/features/create-app/template-form.test.tsx`

Expected: FAIL because the current default is `Create and Publish` with
`createAndPublish`.

- [ ] **Step 3: Make creation repository-only**

Set `SubmitButton` defaults to:

```ts
idleLabel = "Create App";
pendingLabel = "Creating Your App...";
statusText = "Creating your app and its private code repository.";
value = "createOnly";
```

Remove `publishToAzureAction`, `supportsGeneratedTemplateOneStep`, the
`CreateIntent` branch, and the automatic publish block from
`src/app/create/actions.ts`. Keep the final onboarding redirect.

- [ ] **Step 4: Run the focused create tests**

Run: `npm test -- src/features/create-app/template-form.test.tsx src/app/create/[templateSlug]/page.test.tsx src/app/create/page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/create-app/submit-button.tsx src/features/create-app/template-form.test.tsx src/app/create/actions.ts
git commit -m "fix: create generated apps before publishing"
```

### Task 3: Build the Novice Entry Questions

**Files:**
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/app/onboarding/page.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.smoke.test.tsx`
- Modify: `src/app/apps/add/page.tsx`

**Interfaces:**
- Consumes: `start=new|existing` from home-page links.
- Produces: direct novice routes to templates, GitHub import, or local repository creation.

- [ ] **Step 1: Write failing entry-flow tests**

Assert:

```ts
render(await OnboardingStartPage({ searchParams: Promise.resolve({ start: "new" }) }));
expect(screen.getByRole("heading", { name: /choose a starting point/i })).toBeInTheDocument();
expect(screen.getByRole("link", { name: /choose an app template/i })).toHaveAttribute("href", "/create");
expect(screen.queryByText(/github account/i)).not.toBeInTheDocument();

render(await OnboardingStartPage({ searchParams: Promise.resolve({ start: "existing" }) }));
expect(screen.getByRole("heading", { name: /where is your app's code/i })).toBeInTheDocument();
expect(screen.getByRole("link", { name: /already on github/i })).toHaveAttribute("href", "/apps/add?source=github");
expect(screen.getByRole("link", { name: /only on my computer/i })).toHaveAttribute("href", "/apps/add?source=local#local-app");
```

- [ ] **Step 2: Run the onboarding entry test and verify RED**

Run: `npm test -- src/app/onboarding/page.test.tsx src/app/page.smoke.test.tsx`

Expected: FAIL because the current new-app path asks about GitHub and both
answers lead to the same route.

- [ ] **Step 3: Implement the three distinct entry paths**

Replace the decorative GitHub question with:

- `start=new`: explain templates, then **Choose an app template**.
- `start=existing`: ask **Where is your app's code?** with GitHub and local choices.
- no `start`: show all three recovery choices.

Keep the home links at `/onboarding?start=new` and
`/onboarding?start=existing`.

- [ ] **Step 4: Make the add page respect `source`**

Accept `searchParams` in `AddExistingAppPage`. When `source=github`, put the
GitHub form first and identify it as the current step. When `source=local`, put
the local form first. Keep both paths reachable so bookmarks remain useful.

- [ ] **Step 5: Run entry tests and verify GREEN**

Run: `npm test -- src/app/onboarding/page.test.tsx src/app/page.smoke.test.tsx src/app/apps/add/page.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/onboarding/page.tsx src/app/onboarding/page.test.tsx src/app/page.tsx src/app/page.smoke.test.tsx src/app/apps/add/page.tsx src/app/apps/add/page.test.tsx
git commit -m "feat: guide users to the right app starting point"
```

### Task 4: Improve Codex Prompts for Beginners

**Files:**
- Modify: `src/features/repositories/codex-handoff.ts`
- Modify: `src/features/repositories/codex-handoff.test.ts`

**Interfaces:**
- Consumes: repository URL, app name, request ID, branch, and optional source URL.
- Produces: copy-ready prompts for generated/imported repositories and local projects.

- [ ] **Step 1: Write failing beginner-guidance assertions**

For both prompt builders, assert that the prompt contains:

```ts
expect(prompt).toContain("The person I am helping is a beginner");
expect(prompt).toContain("Do not ask me to type terminal or Git commands");
expect(prompt).toContain("Ask only one question at a time");
expect(prompt).toContain("Never ask for my passwords or secret values");
expect(prompt).toContain("run the relevant tests");
expect(prompt).toContain("commit and push");
expect(prompt).toContain("return to the Cedarville App Portal");
```

For the local prompt, also assert that Codex must preserve existing Git history
and report the repository and branch receiving the push.

- [ ] **Step 2: Run the prompt tests and verify RED**

Run: `npm test -- src/features/repositories/codex-handoff.test.ts`

Expected: FAIL on the new novice and safety language.

- [ ] **Step 3: Rewrite both prompts as ordered operating instructions**

Use these sections in the returned string:

1. `Who you are helping`
2. `Your goal`
3. `Safety rules`
4. `Work to perform`
5. `Before you finish`

Retain the existing managed-remote commands as instructions for Codex, not the
user. End generated/imported prompts with **Return to the portal and select
Publish to Azure**. End local prompts with **Return to the portal and select My
code has been uploaded**.

- [ ] **Step 4: Run prompt tests and verify GREEN**

Run: `npm test -- src/features/repositories/codex-handoff.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/repositories/codex-handoff.ts src/features/repositories/codex-handoff.test.ts
git commit -m "feat: make codex handoffs beginner friendly"
```

### Task 5: Create the Shared Wizard Step Presentation

**Files:**
- Create: `src/features/onboarding/step-shell.tsx`
- Create: `src/features/onboarding/step-shell.test.tsx`
- Create: `src/features/onboarding/progress-refresh.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: title, explanation, current stage, support reference, primary action, and optional details.
- Produces: `OnboardingStepShell` and `OnboardingProgressRefresh` components.

- [ ] **Step 1: Write the failing component test**

```tsx
render(
  <OnboardingStepShell
    appName="Campus Dashboard"
    currentStage="Code"
    title="Your code has a safe home"
    explanation="The portal created a private GitHub repository for your app."
    next="Next, choose whether to publish the starter or customize it first."
    supportReference="SUP-20260818-ABC123"
  >
    <button>Continue</button>
  </OnboardingStepShell>,
);

expect(screen.getByRole("heading", { name: /your code has a safe home/i })).toBeInTheDocument();
expect(screen.getByText(/what happens next/i)).toBeInTheDocument();
expect(screen.getByText(/technical details for support/i).closest("details")).not.toHaveAttribute("open");
expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/features/onboarding/step-shell.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the shell and progress refresh**

`OnboardingStepShell` renders a four-stage progress list (`Start`, `Code`,
`Prepare`, `Publish`), the heading and explanation, one action area, a **What
happens next?** box, and a closed support `<details>`.

`OnboardingProgressRefresh` is a client component:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function OnboardingProgressRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, router]);
  return <p role="status">This page checks progress automatically. You can leave it open.</p>;
}
```

- [ ] **Step 4: Add responsive wizard styles**

Replace the generic four-card stack with one emphasized current-step card,
completed progress styling, disabled future stages, a prominent primary action,
and a single-column layout below 600px. Preserve existing Cedarville color
tokens and visible keyboard focus.

- [ ] **Step 5: Run component tests and verify GREEN**

Run: `npm test -- src/features/onboarding/step-shell.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/onboarding/step-shell.tsx src/features/onboarding/step-shell.test.tsx src/features/onboarding/progress-refresh.tsx src/app/globals.css
git commit -m "feat: add novice onboarding step presentation"
```

### Task 6: Implement Generated-App and Actor-Specific Onboarding

**Files:**
- Replace: `src/app/onboarding/[requestId]/page.tsx`
- Create: `src/app/onboarding/[requestId]/page.test.tsx`
- Modify: `src/features/repositories/actions.ts`

**Interfaces:**
- Consumes: `deriveOnboardingState`, current actor, existing GitHub access and publish actions.
- Produces: generated path choice, account guidance, invitation confirmation, Codex handoff, and starter publishing.

- [ ] **Step 1: Write failing page tests for current actor and path choice**

Mock `appRequest.findFirst` with owner username `owner-name`, and
`user.findUnique` with actor username `collaborator-name`. Assert:

```ts
expect(screen.getByDisplayValue("collaborator-name")).toBeInTheDocument();
expect(screen.queryByDisplayValue("owner-name")).not.toBeInTheDocument();
```

For a generated ready app with no path choice, assert two actions:

```ts
expect(screen.getByRole("button", { name: /publish the starter now/i })).toBeInTheDocument();
expect(screen.getByRole("link", { name: /customize it with codex first/i })).toHaveAttribute(
  "href",
  "/onboarding/req_123?path=customize",
);
```

- [ ] **Step 2: Run the request-page test and verify RED**

Run: `npm test -- src/app/onboarding/[requestId]/page.test.tsx`

Expected: FAIL because the current page loads the owner's username and always
renders all four steps.

- [ ] **Step 3: Load the actor independently and derive one state**

Query:

```ts
const currentActor = await prisma.user.findUnique({
  where: { id: userId },
  select: { githubUsername: true },
});
```

Do not select `user.githubUsername` through the app request. Parse only
`path=starter|customize`; ignore other values. Render one
`OnboardingStepShell` based on the resolver output.

- [ ] **Step 4: Implement GitHub account and invitation states**

When customization or local/review access is needed:

- Explain GitHub as the private online home for app code.
- If the actor has no username, show **I already have a GitHub account** to
  navigate to `account=existing`, which reveals the username form. **I need to
  create one** navigates to `account=new`, which shows the external GitHub
  sign-up link and exact return instructions. **I created my account** returns
  to `account=existing`. Preserve `path=customize` while changing the account
  query.
- If access is `INVITED`, show the repository link, explain how to accept the
  invitation, and submit the same access action through **I've accepted the
  invitation** so GitHub can report `GRANTED`.
- If access is `FAILED`, display `repositoryAccessNote` and allow a retry.

- [ ] **Step 5: Implement generated Codex and publish states**

Render the improved prompt, a copy button, and beginner instructions. The
primary publish form is available from both the starter choice and Codex state;
it binds `publishToAzureAction` and uses **Publish to Azure**.

- [ ] **Step 6: Revalidate onboarding after access changes**

Ensure `saveGitHubUsernameAndGrantAccessAction` revalidates
`/onboarding/[requestId]`, `/apps`, and the post-publication details route.

- [ ] **Step 7: Run request-page and access tests and verify GREEN**

Run: `npm test -- src/app/onboarding/[requestId]/page.test.tsx src/features/repositories/access.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/onboarding/[requestId]/page.tsx src/app/onboarding/[requestId]/page.test.tsx src/features/repositories/actions.ts
git commit -m "feat: guide generated apps through first publish"
```

### Task 7: Implement Local and Imported Preparation Recovery

**Files:**
- Modify: `src/app/onboarding/[requestId]/page.tsx`
- Modify: `src/app/onboarding/[requestId]/page.test.tsx`
- Modify: `src/features/repository-imports/actions.ts`
- Modify: `src/features/repository-imports/actions.test.ts`
- Modify: `src/features/repository-imports/add-existing-app-form.tsx`
- Modify: `src/features/repository-imports/add-existing-app-form.test.tsx`

**Interfaces:**
- Consumes: exact preparation state and existing prepare/verify actions.
- Produces: local upload confirmation, direct preparation, retry, safe review, review verification, and failed-import restart.

- [ ] **Step 1: Write failing tests for each preparation action**

Use one mocked request per state. Render each state separately and assert with
Testing Library:

```ts
expect(screen.getByRole("button", { name: "Prepare my app for publishing" })).toBeInTheDocument();
expect(screen.getByRole("status")).toHaveTextContent(/checking your app automatically/i);
expect(screen.queryByRole("button")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "Try preparation again" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Open a safe review on GitHub" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Open the GitHub review" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "I've approved the changes" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "My code has been uploaded" })).toBeInTheDocument();
```

- [ ] **Step 2: Run the preparation page tests and verify RED**

Run: `npm test -- src/app/onboarding/[requestId]/page.test.tsx`

Expected: FAIL because current logic treats all non-committed states alike and
excludes local apps from preparation.

- [ ] **Step 3: Bind only valid actions**

- `PENDING_USER_CHOICE`: `prepareExistingAppAction` with `DIRECT_COMMIT`.
- Local `PENDING_USER_CHOICE`: show Codex prompt first; **My code has been
  uploaded** submits `DIRECT_COMMIT`.
- `FAILED`: resubmit the stored `preparationMode` only.
- `BLOCKED` plus `CONFLICTED`: after GitHub access, submit `PULL_REQUEST`.
- `PULL_REQUEST_OPENED`: bind `verifyExistingAppPreparationAction`.
- `RUNNING`: show `OnboardingProgressRefresh` and no form.
- `COMMITTED`: advance to publishing setup.

- [ ] **Step 4: Fix failed-import restart and redirect coverage**

Update the stale action test to expect:

```ts
await expect(addExistingAppFormAction(...)).rejects.toThrow(
  "redirect:/onboarding/req_form_success",
);
```

Allow `AddExistingAppForm` initial field values. For `IMPORT_FAILED`, link to:

```ts
`/apps/add?source=github&repositoryUrl=${encodeURIComponent(sourceUrl)}&appName=${encodeURIComponent(appName)}`
```

Read those query values on the add page and pass them to the form. Do not
delete or reuse a partial target repository.

- [ ] **Step 5: Revalidate onboarding after preparation and verification**

Keep `/apps`, `/download/[requestId]`, and `/onboarding/[requestId]` in the
shared revalidation helper.

- [ ] **Step 6: Run import and preparation tests and verify GREEN**

Run: `npm test -- src/app/onboarding/[requestId]/page.test.tsx src/features/repository-imports/actions.test.ts src/features/repository-imports/add-existing-app-form.test.tsx src/features/repository-imports/publishing-bundle.test.ts src/features/repository-imports/compatibility.test.ts src/features/repository-imports/prepare-repository.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/onboarding/[requestId]/page.tsx src/app/onboarding/[requestId]/page.test.tsx src/features/repository-imports/actions.ts src/features/repository-imports/actions.test.ts src/features/repository-imports/add-existing-app-form.tsx src/features/repository-imports/add-existing-app-form.test.tsx
git commit -m "feat: guide imported and local app preparation"
```

### Task 8: Implement Publishing Setup and Failure Recovery

**Files:**
- Modify: `src/app/onboarding/[requestId]/page.tsx`
- Modify: `src/app/onboarding/[requestId]/page.test.tsx`
- Modify: `src/features/publishing/actions.ts`
- Modify: `src/features/publishing/actions.test.ts`
- Modify: `src/features/publishing/setup/actions.ts`
- Modify: `src/features/publishing/setup/actions.test.ts`

**Interfaces:**
- Consumes: `publishingSetupStatus`, `publishStatus`, setup error summaries, and latest publish attempt.
- Produces: checking, repair, publish, deployment progress, retry, and success states.

- [ ] **Step 1: Write failing setup and publish state tests**

Assert these exact action rules:

- `CHECKING` and `REPAIRING`: automatic refresh, no submit button.
- imported `NOT_CHECKED`: **Finish publishing setup**, bound to the existing
  repair/setup action.
- `NEEDS_REPAIR` and `BLOCKED`: **Fix publishing setup** only.
- imported `READY`: **Publish to Azure**.
- `QUEUED`, `PROVISIONING`, `DEPLOYING`: automatic refresh and deployment log
  when available.
- `FAILED`: user-safe error plus **Try publishing again** and **Fix publishing
  setup**.
- `SUCCEEDED`: success handoff and **Open app details**.
- `DELETED`: no recovery mutation; return to My Apps or contact support.

- [ ] **Step 2: Run publish-state tests and verify RED**

Run: `npm test -- src/app/onboarding/[requestId]/page.test.tsx`

Expected: FAIL because the current page ignores setup status and omits retry and
repair actions.

- [ ] **Step 3: Implement state-specific publishing UI**

Bind:

- `repairPublishingSetupAction` for setup repair.
- `publishToAzureAction` only for `READY_TO_PUBLISH`.
- `retryPublishAction` only for `PUBLISH_FAILED`.

Use the existing safe summaries. Put check keys, provider details, and the
support reference inside **Technical details for support**.

- [ ] **Step 4: Revalidate onboarding from publishing actions**

Add `/onboarding/[requestId]` to both `revalidatePublishViews` and
`revalidatePublishingSetupViews`.

- [ ] **Step 5: Run publishing tests and verify GREEN**

Run: `npm test -- src/app/onboarding/[requestId]/page.test.tsx src/features/publishing/actions.test.ts src/features/publishing/setup/actions.test.ts src/features/publishing/setup/service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/onboarding/[requestId]/page.tsx src/app/onboarding/[requestId]/page.test.tsx src/features/publishing/actions.ts src/features/publishing/actions.test.ts src/features/publishing/setup/actions.ts src/features/publishing/setup/actions.test.ts
git commit -m "feat: guide publishing setup and recovery"
```

### Task 9: Make Onboarding the Only Novice Pre-Publish Destination

**Files:**
- Modify: `src/app/apps/page.tsx`
- Modify: `src/app/apps/page.test.tsx`
- Modify: `src/app/download/[requestId]/page.tsx`
- Create or modify: `src/app/download/[requestId]/page.test.tsx`
- Modify: `src/middleware.ts`
- Modify: `src/middleware.test.ts`

**Interfaces:**
- Consumes: app publish status and current actor admin status.
- Produces: correct My Apps destination and unpublished detail redirect.

- [ ] **Step 1: Write failing My Apps routing tests**

For an unpublished request:

```ts
expect(screen.getByRole("link", { name: /continue setup/i })).toHaveAttribute(
  "href",
  "/onboarding/req_unpublished",
);
```

For a published request:

```ts
expect(screen.getByRole("link", { name: /app details/i })).toHaveAttribute(
  "href",
  "/download/req_published",
);
```

Apply the same destination to the app-name link.

- [ ] **Step 2: Run My Apps tests and verify RED**

Run: `npm test -- src/app/apps/page.test.tsx`

Expected: FAIL because every card links to `/download`.

- [ ] **Step 3: Implement conditional card destinations**

```ts
const destination = request.publishStatus === "SUCCEEDED"
  ? `/download/${request.id}`
  : `/onboarding/${request.id}`;
const actionLabel = request.publishStatus === "SUCCEEDED"
  ? "App Details"
  : "Continue Setup";
```

- [ ] **Step 4: Write failing details-redirect and middleware tests**

Assert that an unpublished non-admin request throws
`redirect:/onboarding/req_123`, a published request renders details, and an
admin may render unpublished details for support. Add
`/onboarding/:path*` to the middleware matcher expectation.

- [ ] **Step 5: Implement details redirect and route protection**

After loading the accessible request in `DownloadPage`:

```ts
if (appRequest.publishStatus !== "SUCCEEDED" && !isAdmin) {
  redirect(`/onboarding/${appRequest.id}`);
}
```

Remove the pre-publication advanced-details link from onboarding. Add the
onboarding matcher.

- [ ] **Step 6: Run navigation tests and verify GREEN**

Run: `npm test -- src/app/apps/page.test.tsx src/app/download/[requestId]/page.test.tsx src/middleware.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/apps/page.tsx src/app/apps/page.test.tsx src/app/download/[requestId]/page.tsx src/app/download/[requestId]/page.test.tsx src/middleware.ts src/middleware.test.ts
git commit -m "feat: resume unpublished apps in onboarding"
```

### Task 10: Update Novice Documentation and Browser Coverage

**Files:**
- Modify: `README.md`
- Modify: `docs/portal/setup.md`
- Modify: `docs/user/quick-start.md`
- Modify: `docs/user/guide.md`
- Modify: `docs/user/troubleshooting.md`
- Create: `e2e/onboarding.spec.ts`
- Regenerate: `output/pdf/*.pdf`
- Regenerate: `public/docs/*.pdf`

**Interfaces:**
- Consumes: final wizard labels and behavior.
- Produces: operator and user documentation matching the product.

- [ ] **Step 1: Update documentation tests or add copy assertions first**

In `docs/readme.test.ts`, assert that README documents the wizard and that the
quick start contains **Publish the starter now**, **Customize it with Codex
first**, and **Continue Setup** while no longer containing **Create and
Publish**.

- [ ] **Step 2: Run documentation tests and verify RED**

Run: `npm test -- docs/readme.test.ts`

Expected: FAIL on the old quick-start language.

- [ ] **Step 3: Update portal and user documentation**

Document all three starting paths, optional generated customization, GitHub
account instructions, local Codex upload, conflict review, repair, publishing,
and post-publication details. Keep the Quick Start within its one-page PDF
constraint by moving exceptional recovery detail into troubleshooting.

- [ ] **Step 4: Write the generated-starter Playwright journey**

Create a test that uses the configured auth bypass to:

1. Open the home page and choose **Create New App**.
2. Confirm the page explains that the next step is choosing a template.
3. Return and choose **Add Existing App**.
4. Confirm the page offers distinct **Already on GitHub** and **Only on my
   computer** paths.
5. Follow both links and confirm each intended form receives focus through its
   heading or URL fragment.

Request-specific publishing states remain covered by server-rendered page
tests because the local Playwright server intentionally has no GitHub or Azure
credentials.

- [ ] **Step 5: Regenerate user PDFs**

Run: `npm run docs:pdf`

Expected: the Quick Start fits on one US Letter page and regenerated copies are
written to both PDF output directories.

- [ ] **Step 6: Run documentation and browser tests**

Run: `npm test -- docs/readme.test.ts src/features/help/docs.test.ts`

Run when local browser dependencies are available:
`npm run test:e2e -- e2e/onboarding.spec.ts`

Expected: PASS. If external provider configuration prevents the browser test,
record the exact prerequisite and retain passing unit/integration coverage.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/portal/setup.md docs/user docs/readme.test.ts e2e/onboarding.spec.ts output/pdf public/docs
git commit -m "docs: explain the guided publishing workflow"
```

### Task 11: Full Verification and Finding Audit

**Files:**
- Modify only files required by failures found during verification.

**Interfaces:**
- Consumes: all prior task deliverables.
- Produces: fresh evidence that the implementation addresses all seven findings.

- [ ] **Step 1: Run the complete unit and integration suite**

Run: `npm test`

Expected: all Vitest test files pass with zero failed tests, including the
formerly stale repository-import redirect expectation.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: Next.js compilation, type checking, page-data collection, and static
generation finish successfully.

- [ ] **Step 3: Run the portal-required targeted checks**

Run:

```bash
npm test -- \
  src/features/repository-imports/publishing-bundle.test.ts \
  src/features/repository-imports/compatibility.test.ts \
  src/features/repository-imports/prepare-repository.test.ts \
  src/features/generation/deployment-manifest.test.ts \
  src/features/publishing/setup/service.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run formatting and diff checks**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Audit all seven findings against code and tests**

Confirm:

1. Generated creation cannot queue publishing.
2. Local apps can advance from upload through preparation.
3. Every import/setup state exposes only valid actions.
4. GitHub forms use the current actor.
5. GitHub account answers produce distinct paths and are asked only when
   access is necessary.
6. The full test suite has no stale redirect expectation.
7. Unpublished users resume onboarding and published users open full details.

- [ ] **Step 6: Record verification evidence**

Capture the test counts, build exit status, and any intentionally skipped
browser prerequisite in the final handoff. If verification reveals a defect,
return to the affected task, write a failing regression test, implement the
minimal correction, rerun that task's focused tests, and use that task's
explicit commit scope.
