import type { ImportedAppFeatures } from "@/features/repository-imports/features";
import {
  EXPRESS_ENTRA_LOGIN_GUIDANCE,
  NEXTJS_ENTRA_LOGIN_GUIDANCE,
  type LoginUpdateFramework,
} from "./entra-login-guidance";

export const LOCAL_UPLOAD_CONFIRMATION_LABEL = "My code has been uploaded";
export const LOCAL_REPAIR_CONFIRMATION_LABEL =
  "I've repaired and uploaded my code";

function managedGitReadinessInstructions(appName: string) {
  return [
    "Codex project and Git readiness",
    "This task must run inside a local Codex project whose primary folder is the intended app folder.",
    "Do not continue from Quick chat or a standalone task.",
    "First confirm that the current working folder is the local Codex project's primary folder and that it is intended for this app.",
    `If this is not the local project for "${appName}", or you cannot verify the folder, stop and tell me to create or open the correct local Codex project. Do not search other folders for the app.`,
    "Run git --version yourself before any Git or file-changing command.",
    "If Git is available, briefly tell me that the local history tool is ready and continue.",
    "If Git is unavailable, do all of the following:",
    "- Do not attempt to install Git, run an installer, or download anything.",
    "- Ask one question only: am I using Windows or macOS?",
    '- On Windows, tell me to open "Company Portal", search for "Git", and select Install.',
    '- On macOS, explain that Git should be installed automatically by Cedarville login scripts. If Git is unavailable, tell me to contact Cedarville IT for help.',
    "- Completely quit and reopen Codex after installation finishes, reopen this local project, and return to this task.",
    "- Then stop and wait. Do not run repository commands until I return and git --version succeeds.",
    "GitHub connection recovery",
    "Own GitHub setup and recovery. Run technical commands yourself and continue through the applicable steps below in order without asking me to choose tools or run commands. Use only HTTPS repository URLs.",
    "1. Try existing Git authentication: use the intended repository URL with the available Git executable. Bound network attempts and credential prompts with a timeout so a hidden username/password prompt cannot hang the task. When required, allow secure browser or operating-system sign-in; never enter a password into a terminal prompt.",
    "2. Diagnose and repair credential handling: after a failure, inspect the error, operating system, Git executable path, and git config --show-origin --get-all credential.helper. Distinguish credential problems from a wrong repository URL, missing access or invitation, organization SSO requirements, network/proxy errors, and certificate errors. Do not assume a 404 proves the repository does not exist.",
    "Check whether Git Credential Manager (GCM) is installed with git credential-manager --version. On macOS, osxkeychain may be configured while GCM is installed but unused; the keychain helper alone does not initiate GCM browser sign-in. If appropriate, retry with GCM through command-scoped credential.helper settings, clearing the inherited helper list for that command before selecting the installed GCM helper. Do not print retrieved credentials. git credential-manager configure registers GCM but changes user-level Git configuration; prefer command-scoped settings before cloning and repository-local, GitHub-specific settings afterward. Do not run configure or gh auth setup-git as a blanket global repair.",
    "3. Try the GitHub plugin: if local Git access still fails, discover and use available GitHub plugin tools to check the connected identity and access to the exact repository. Use supported repository operations when helpful. If the plugin is unavailable, disconnected, or lacks the needed capability, continue to GitHub CLI without getting stuck. Plugin access does not authenticate local Git; never extract plugin credentials or treat a plugin file listing or source archive as a completed local checkout.",
    "4. Try GitHub CLI: check whether gh is already installed and run gh auth status --hostname github.com. Reuse working authentication for the intended account. If gh is missing, install it yourself using an existing package manager without administrator access, or an official release for the current OS and architecture in a user-writable tools directory after verifying its published checksum. Use its absolute executable path if necessary; do not install a package manager, use sudo, or run an unverified download. If installation is blocked, continue with other available methods and record the limitation. gh still requires Git to clone.",
    "For an authenticated gh account, retry Git with the gh auth git-credential helper using command-scoped settings that clear inherited credential helpers for that attempt. After verifying or cloning the intended repository, retain a working helper with repository-local, GitHub-specific configuration so later fetches and pushes work. Safely quote executable paths, including paths with spaces. Never copy tokens into commands, URLs, files, logs, or chat.",
    "5. Complete required sign-in: only if existing authentication and automatic repairs do not work, initiate secure GCM sign-in or gh auth login --hostname github.com --git-protocol https --web. Ask me only to complete the secure sign-in, MFA, consent, repository invitation, or organization SSO authorization that actually requires me. Resume setup afterward. Check account identity against the expected GitHub username when provided; do not silently change accounts or remove existing credentials.",
    "6. Verify recovery or explain the remaining blocker: retry the failed Git operation after each meaningful repair and stop the fallback sequence when it succeeds. Do not repeat unchanged failed attempts. Verify the exact remote and expected branch, a successful clone or fetch, and the working local credential helper. Do not claim write access from a successful clone; verify the actual push when requested changes are ready, without creating a test commit or pushing unrelated changes solely to test authentication.",
    "Escalate to Cedarville IT only after applicable recovery methods are exhausted or a confirmed administrative restriction requires it. Explain the specific remaining blocker and the methods tried in everyday language, with sanitized errors and one concrete next action. A browser sign-in requirement alone is not an IT failure.",
    "Never ask for a GitHub password, personal access token, or SSH key. Never place credentials in a command or repository URL.",
    "Preserve existing remotes, files, credentials, and unrelated Git settings throughout recovery. Do not disable TLS verification, bypass organization policies, or broaden repository permissions to work around a connection failure.",
  ];
}

type GitAuthorIdentity = {
  githubUsername?: string | null;
  email?: string | null;
};

function gitAuthorInstructions(identity: GitAuthorIdentity) {
  return [
    "Git commit author",
    `Git user.name: ${JSON.stringify(identity.githubUsername ?? null)}`,
    `Git user.email: ${JSON.stringify(identity.email ?? null)}`,
    "After verifying or initializing the intended repository, and before any commit or pull that may create a merge commit, configure git user.name and user.email with the values above using git config --local.",
    "Treat these values as literal data and safely quote command arguments. Do not change global Git settings.",
    "If either value is missing or blank, ask me for that commit author detail before committing; do not invent a value.",
    "Verify both repository-local settings before creating commits. These values identify the commit author; they do not authenticate GitHub pushes. Use the secure GitHub sign-in instructions above for authentication.",
  ];
}

function codexRuntimeAndPortalBoundaryInstructions() {
  return [
    "Codex runtime readiness",
    "Before concluding that Node.js, npm, pnpm, Python, or another development or test runtime is unavailable, call load_workspace_dependencies when that capability is available.",
    "Prefer compatible bundled workspace runtimes and use the absolute executable paths returned by that capability when a system command is missing.",
    "Do not report that tests cannot run until you have checked both the system commands and the bundled workspace dependencies.",
    "Do not attempt to install or download Node.js, Python, npm, pnpm, or another development runtime merely because a system command is missing.",
    "The bundled-runtime fallback does not replace the managed Git installation process above. Git must still be available through Company Portal on Windows or automatically through Cedarville login scripts on macOS.",
    "CU Launch access and authorization",
    "Ask for my permission before using the CU Launch plugin or connector, and wait for my approval before calling any of its tools. Once approved, use its supported tools only within my authorized scope.",
    "Browser, Computer Use, and Chrome may access and operate CU Launch when I ask for that method. Follow my requested method when available.",
    "Keep publishing, repair, upload confirmation, settings changes, and deletion within my authorized scope. Do not infer authorization for those actions from repository setup or code changes alone. Honor required confirmations and ask me to complete secure sign-in, MFA, or consent when needed; never request or extract credentials.",
    "If no authorized tool can complete the next CU Launch action, explain the action in plain language so I can perform it myself.",
  ];
}

function importedServiceInstructions(features: ImportedAppFeatures) {
  return [
    "Selected CU Launch import services",
    "These choices are the project work already requested. After repository setup, implement the selected services before publishing; do not ask me to repeat this request.",
    features.databaseProvider === "postgresql"
      ? "Database: add PostgreSQL using the server-only DATABASE_URL supplied by CU Launch. Add the application's tables, versioned migrations, and database access using its existing stack. Preserve existing data and storage behavior; do not copy production data, replace an existing database, or run destructive migrations without a separate request."
      : "Database: no new CU Launch database requested. Preserve existing storage and data; do not add a managed PostgreSQL dependency.",
    features.entraLogin
      ? `Login: require verified Cedarville Microsoft Entra sign-in before protected pages and APIs, with server-side session and authorization checks. Do not use a client-only gate, pretend session, or production authentication bypass. Use CU Launch's AUTH_SECRET, AUTH_MICROSOFT_ENTRA_ID_ID, AUTH_MICROSOFT_ENTRA_ID_SECRET, AUTH_MICROSOFT_ENTRA_ID_ISSUER, AUTH_URL, and NEXTAUTH_URL settings. For FastAPI use /login and /auth/callback; for Express preserve its framework-appropriate flow and /api/auth/callback/microsoft-entra-id so the callback matches portal provisioning. ${NEXTJS_ENTRA_LOGIN_GUIDANCE}`
      : "Login: no new CU Launch Cedarville login requested. Do not add a managed Entra dependency or remove existing authentication or authorization without a separate request.",
    "If either selected service needs a server and the app is plain static HTML, migrate it to supported root Next.js, Express, or FastAPI while preserving the app's behavior. Never put database credentials or Entra client secrets in browser code.",
    "Keep GET /api/health public and returning HTTP 200 for a healthy app process, independently of sessions, databases, and external services. Leave only that exact health route and necessary sign-in/callback routes anonymous when Cedarville login is required.",
    "Inspect app-portal/deployment-manifest.json if present and keep it aligned with these choices. Before portal preparation creates that file, use these instructions as the service contract; do not create conflicting publishing files yourself.",
    "Document required environment-variable names with placeholder values only. CU Launch supplies production settings during publishing setup; never invent credentials, ask me to paste secrets, or provision cloud resources yourself.",
    "Test database behavior and migrations with isolated local fixtures, plus anonymous denial and authenticated access for protected routes when login is selected. Run the relevant checks and production build. Report any live database or Cedarville sign-in verification that still needs the provisioned environment; local checks do not prove live integration.",
    "After implementing and verifying the selected services, commit and push only the intended changes, verify the push, and explain the next CU Launch action. Use the access and authorization guidance above if I ask you to perform it. Do not claim that provisioning alone connects or protects the app.",
  ];
}

export function buildCodexHandoffPrompt(
  repositoryUrl: string,
  appName: string,
  requestId: string,
  options: {
    defaultBranch?: string | null;
    sourceRepositoryUrl?: string | null;
    localFolderMode?: "new" | "new-or-existing";
    gitAuthor?: GitAuthorIdentity;
    importFeatures?: ImportedAppFeatures;
  } = {},
) {
  const prompt = [
    "Who you are helping",
    "The person I am helping is a beginner who may not know Git, repositories, branches, commits, pull requests, Azure, or publishing.",
    "Explain what you are doing in everyday language.",
    "",
    "Your goal",
    `Prepare the local project for "${appName}" for Cedarville App Portal request ${requestId}, then help me make the changes I request.`,
    options.importFeatures
      ? "First verify the repository setup, then implement the selected import services below."
      : "First own the repository setup and verification. Do not invent an app-change request or assume publishing is next.",
    "",
    "Safety rules",
    "Do not ask me to type terminal or Git commands. Run the technical commands yourself.",
    "Ask only one question at a time, and only when a true human choice is needed.",
    "Never ask for my passwords or secret values. Do not expose, copy, commit, or paste credentials, tokens, or other secrets.",
    "Do not ask for portal credentials.",
    ...managedGitReadinessInstructions(appName),
    ...gitAuthorInstructions(options.gitAuthor ?? {}),
    ...codexRuntimeAndPortalBoundaryInstructions(),
    "",
    "Work to perform",
  ];

  if (options.sourceRepositoryUrl) {
    const defaultBranch = options.defaultBranch ?? "main";

    prompt.push(
      `Confirm that the primary folder contains the existing local checkout for "${appName}". If it does not, stop without changing files or Git settings and explain how to open the correct local project.`,
      "Inspect the existing files and Git history before changing anything.",
      `This app was imported from ${options.sourceRepositoryUrl}.`,
      "Keep the existing origin remote pointed at the source repository.",
      "Verify the original source connection before changing anything:",
      "git remote get-url origin",
      `The origin URL must identify ${options.sourceRepositoryUrl}. If it does not, stop and explain the mismatch without changing any remote.`,
      "Check for unfinished local work before downloading portal changes:",
      "git status --short",
      "If there are uncommitted changes, stop and explain them in everyday language before asking one question about how to proceed.",
      "Inspect the existing remote names and URLs, then check whether a remote named portal exists:",
      "git remote -v",
      "git remote get-url portal",
      `If portal does not exist, add it with the exact managed URL: git remote add portal ${repositoryUrl}`,
      `If portal already points to ${repositoryUrl}, with an optional trailing .git, use portal as the verified portal remote.`,
      "If portal points somewhere else, preserve it and choose an unused name such as portal-managed or portal-managed-2 for the managed repository. Do not rename, delete, or overwrite any existing remote.",
      `Add the unused remote name with the exact managed URL: git remote add <unused-portal-remote> ${repositoryUrl}`,
      "Inspect the selected remote before using it:",
      "git remote get-url <verified-portal-remote>",
      `Verify that the selected portal remote URL exactly matches ${repositoryUrl}, with an optional trailing .git. If it does not, stop.`,
      "git fetch <verified-portal-remote>",
      `git pull --ff-only <verified-portal-remote> ${defaultBranch}`,
      `git push <verified-portal-remote> HEAD:${defaultBranch}`,
      "Use the verified portal remote when preparing work for CU Launch publishing.",
    );
  } else if (options.localFolderMode === "new-or-existing") {
    const defaultBranch = options.defaultBranch ?? "main";

    prompt.push(
      `Confirm that the primary folder is intended for "${appName}" and is either empty or the existing local checkout for this app.`,
      "If the primary folder is empty, clone the managed repository into this exact folder:",
      `git clone ${repositoryUrl} .`,
      "Then confirm that the clone succeeded and verify its origin:",
      "git remote get-url origin",
      `The origin URL must exactly match ${repositoryUrl}, with an optional trailing .git. If it does not, stop and do not change the remote.`,
      "If the primary folder already contains the app, do not clone, reinitialize Git, delete files, or change any remote.",
      "Confirm that it is a Git repository and inspect its origin:",
      "git remote get-url origin",
      `The existing origin URL must exactly match ${repositoryUrl}, with an optional trailing .git. If it does not, stop and explain that this is not the managed app checkout.`,
      "Check for unfinished local work before downloading updates:",
      "git status --short",
      "If there are uncommitted changes, stop and explain them in everyday language before asking one question about how to proceed.",
      "If the working tree is clean, safely download the newest managed version without creating a merge commit:",
      `git pull --ff-only origin ${defaultBranch}`,
    );
  } else {
    prompt.push(
      `Confirm that the primary folder is the new empty folder intended for "${appName}".`,
      "The folder must contain no files or subfolders because the managed repository will be cloned directly into it.",
      "If the folder contains anything at all, stop and ask one plain-language question before continuing.",
      "Do not delete, move, or overwrite unexpected files to make the folder appear empty.",
      "After the project-folder check and git --version both succeed, clone the managed repository into this exact primary folder:",
      `git clone ${repositoryUrl} .`,
      "Confirm that the clone succeeded and verify its origin before editing:",
      "git remote get-url origin",
      `The origin URL must identify ${repositoryUrl}. If it does not, stop and do not change the remote.`,
    );
  }

  prompt.push(
    "Use the managed repository as the source of truth and inspect only enough files to confirm that the project is ready.",
    "Use `.codex/skills/cu-app-portal/SKILL.md` for CU Launch-managed app workflow guidance.",
    NEXTJS_ENTRA_LOGIN_GUIDANCE,
  );

  if (options.importFeatures) {
    prompt.push(...importedServiceInstructions(options.importFeatures));
  } else {
    prompt.push(
      "",
      "Repository ready — ask for project work",
      "After the repository setup and verification succeed, do not modify app files yet.",
      'Ask exactly one question: "The project is ready. What would you like me to change or build in this project?"',
      "Stop and wait for my answer before modifying app files, running change-specific tests, committing changes, or pushing new work.",
      "Do not assume that publishing is the next task. The next task is the modification or feature I describe.",
      "After I answer, restate my requested outcome in plain language, make only the requested changes, and verify them.",
    );
  }

  prompt.push(
    "",
    "Before you finish",
    "After completing the project work I requested, run the relevant tests using compatible system or bundled workspace runtimes, explain the result plainly, then commit and push the completed work through the CU Launch-supported workflow.",
    "Push-to-deploy is enabled by default for new managed apps. If this app has already been published and auto-deploy is enabled, pushing to its default branch deploys the changes automatically. Explain that effect before pushing. The app details page offers Disable Auto-Deploy for manual publishing; existing apps retain their saved mode.",
    "Verify that the push succeeded and give me a simple status summary.",
    "Tell me that the requested changes are ready in GitHub. If auto-deploy is enabled on an already published app, explain that the push starts deployment; do not claim it is live without verification. First publish or manual publishing still uses CU Launch and requires my authorization.",
    "Do not make publishing the next step unless I ask about publishing. Use the CU Launch access and authorization guidance above for requested portal actions.",
  );

  return prompt.join("\n");
}

export function buildLocalCodexGitSetupPrompt({
  repositoryUrl,
  appName,
  requestId,
  defaultBranch = "main",
  preparationErrorSummary,
  gitAuthor,
  importFeatures,
}: {
  repositoryUrl: string;
  appName: string;
  requestId: string;
  defaultBranch?: string | null;
  preparationErrorSummary?: string | null;
  gitAuthor?: GitAuthorIdentity;
  importFeatures?: ImportedAppFeatures;
}) {
  const branch = defaultBranch ?? "main";

  const prompt = [
    "Who you are helping",
    "The person I am helping is a beginner who may not know Git, repositories, branches, commits, pull requests, Azure, or publishing.",
    "Explain what you are doing in everyday language.",
    "",
    "Your goal",
    `Connect the local "${appName}" project to the CU Launch managed repository for request ${requestId}.`,
    "You own the technical workflow: inspect the app, connect and upload the code safely, and verify the result.",
    "",
    "Safety rules",
    "Do not ask me to type terminal or Git commands. Run the technical commands yourself.",
    "Ask only one question at a time, and only when a true human choice is needed.",
    "Never ask for my passwords or secret values. Do not expose, copy, commit, or paste credentials, tokens, or other secrets.",
    ...managedGitReadinessInstructions(appName),
    ...gitAuthorInstructions(gitAuthor ?? {}),
    ...codexRuntimeAndPortalBoundaryInstructions(),
    "",
    "Work to perform",
    `Managed repository: ${repositoryUrl}`,
    `Use ${branch} as the portal branch.`,
    `Confirm that the local Codex project primary folder is the existing app folder for "${appName}". Verify this from the folder contents and explain what you recognize in everyday language.`,
    "Do not initialize Git, change remotes, stage files, or edit the app until both checks pass: this is the intended app folder, and git --version succeeds.",
    "Inspect the local project's Git status, existing remotes, and existing commits without changing app files. First, preserve any existing Git history and remotes.",
    "Check that secret and local environment files are excluded before staging anything.",
    "If Git is not initialized, initialize it before creating the initial commit:",
    "git init",
    `git branch -M ${branch}`,
    "Check whether a remote named portal already exists and inspect its URL:",
    "git remote get-url portal",
    `Verify that its URL exactly matches ${repositoryUrl} before using it for any push.`,
    "Never push to an existing portal remote whose URL does not exactly match the managed repository.",
    "If portal does not exist, add it with this exact managed repository URL:",
    `git remote add portal ${repositoryUrl}`,
    "If portal exists with a different URL and is clearly an obsolete portal entry, record the old URL and update only that remote with git remote set-url portal <managed-repository-url>.",
    "If the existing portal remote may still be useful, preserve that remote and choose an unused, unambiguous name such as portal-managed (or portal-managed-2 if needed). Do not rename, delete, or overwrite other remotes.",
    "Run git remote get-url <verified-managed-remote> and confirm it exactly matches the managed repository before continuing.",
    "Pull the CU Launch starter commit before inspecting, changing, staging, or uploading the local app. That commit contains the app-local CU Launch skill and no replacement app code.",
    `git pull --no-rebase <verified-managed-remote> ${branch}`,
    "If the local repository already has commits that do not share history with the managed repository, preserve both histories and use:",
    `git pull --no-rebase --allow-unrelated-histories <verified-managed-remote> ${branch}`,
    "If the pull reports a conflict, do not overwrite either version, do not push, and do not discard local work. Explain the conflicting file in plain language and ask exactly one question only if a human choice is genuinely required.",
    "Read `.codex/skills/cu-app-portal/SKILL.md` from the pulled managed commit before continuing.",
    NEXTJS_ENTRA_LOGIN_GUIDANCE,
    "Inspect the local app using the compatibility and safe-migration workflow in that skill. If migration is needed, follow the skill instead of inventing a different hosting path in this prompt.",
    "Run the relevant tests using compatible system or bundled workspace runtimes. Do not upload code whose relevant tests fail.",
    ...(importFeatures ? importedServiceInstructions(importFeatures) : []),
    "Inspect candidate files with git status before staging.",
    "After reviewing them, stage only intentional source, configuration, and documentation files by explicit path. Do not use a broad catch-all staging command.",
    "Re-check the staged file names and diff with git diff --cached --name-only and git diff --cached.",
    "Unstage anything sensitive or local before committing with git rm --cached -- <path>; this removes it from the staged list without deleting the local file and works before the first commit.",
    'git commit -m "Prepare local app for portal hosting"',
    "Push the current local code to the CU Launch-managed repository:",
    `git push -u <verified-managed-remote> HEAD:${branch}`,
    "",
    "Before you finish",
    "Before you finish, run the relevant tests using compatible system or bundled workspace runtimes, explain the result plainly, then commit and push the completed work through the CU Launch-supported workflow.",
    `Verify that the push succeeded, and report the repository and branch that received the push: ${repositoryUrl} (${branch}).`,
    "Give me a simple status summary.",
    preparationErrorSummary
      ? `After the push succeeds, explain that the next CU Launch action is "${LOCAL_REPAIR_CONFIRMATION_LABEL}". If I ask you to confirm the upload, use the CU Launch access and authorization guidance above; otherwise tell me that I can return to CU Launch and select it myself.`
      : `After the push succeeds, explain that the next CU Launch action is "${LOCAL_UPLOAD_CONFIRMATION_LABEL}". If I ask you to confirm the upload, use the CU Launch access and authorization guidance above; otherwise tell me that I can return to CU Launch and select it myself.`,
  ];

  if (preparationErrorSummary) {
    prompt.splice(
      prompt.indexOf("Work to perform"),
      0,
      "Repair needed before uploading again",
      "CU Launch inspected the previous upload and found a deterministic compatibility problem. Repair the app itself before pushing and confirming another upload; repeating the same CU Launch action without code changes will not help.",
      `CU Launch feedback: ${preparationErrorSummary}`,
      "For plain static apps, use CU Launch's exact rule: A root index.html alone is not enough.",
      "A plain static app must not contain package.json, requirements.txt, or pyproject.toml. If package.json exists, determine whether it is truly unused or whether the app must be migrated to supported Next.js or Express.",
      "Do not add app-portal/http_server_start.py before uploading the repair. CU Launch adds that Python runner after compatibility succeeds.",
      "Inspect that feedback, make the smallest safe source-code or runtime change that resolves it, and run the relevant tests before continuing with the upload steps below.",
      "",
    );
  }

  return prompt.join("\n");
}

export function buildLoginUpdatePrompt({ repositoryUrl, appName, framework = "nextjs" }: {
  repositoryUrl: string;
  appName: string;
  framework?: LoginUpdateFramework;
}) {
  const frameworkInstructions = framework === "express"
    ? [
        "Confirm that this is an Express app with Microsoft Entra / OpenID Connect authentication. If the recorded framework does not match the actual code, explain the mismatch before making authentication changes. If the equivalent login flow is already present, inspect and test it first; report what still needs verification rather than replacing a working implementation or making cosmetic route changes.",
        EXPRESS_ENTRA_LOGIN_GUIDANCE,
        "Style /login consistently with this app and explain that sign-in continues to Cedarville University's Microsoft sign-in page. Inspect any existing public welcome page and login-start handler, and reuse them where appropriate. Adapt route names to avoid collisions while keeping the public login page and its CSRF-protected POST handler distinct. Add only the middleware and parsing needed by this app's existing framework.",
      ]
    : [
        "If this is not a Next.js app using Auth.js and Microsoft Entra, explain the mismatch before making authentication changes. If the custom login fix is already present, verify it instead of replacing it.",
        NEXTJS_ENTRA_LOGIN_GUIDANCE,
        "Style /login consistently with this app. Add one Sign in with your Cedarville account button and explain that it continues to Cedarville University's Microsoft sign-in page. Do not ask for passwords on this page. Set pages: { signIn: \"/login\" } and make the exact page anonymous without exposing other content or creating redirect loops.",
      ];
  return [
    `Update the existing "${appName}" app with a custom Cedarville /login flow appropriate to its ${framework === "express" ? "Express" : "Next.js"} framework. The custom login approach resolved the warning for the Next.js app History4U; verify its suitability here instead of assuming it clears Google's classification.`,
    `Expected managed repository: ${repositoryUrl}`,
    "Work inside the existing local Codex project for this app. Run git --version and check git status and remote URLs before editing. If this is not the intended app checkout, stop and explain the mismatch in plain language.",
    ...codexRuntimeAndPortalBoundaryInstructions(),
    "Inspect the project's instructions and current auth code first. Verify that the current checkout has the expected managed repository among its remotes before editing. Preserve unrelated local work, existing remotes, history, app features, and audience restrictions. Never print secrets.",
    ...frameworkInstructions,
    "Update normal sign-in links and unauthenticated redirects to use the custom page. Preserve requested destinations only after validating they are same-origin and cannot create login/auth redirect loops; otherwise return to /.",
    "Run focused checks for the public login page, protected pages and APIs, safe return destinations, sign-in errors, and the unchanged callback, then the production build. Do not bypass a browser security warning. Do not claim the warning is resolved without testing the deployed sign-in flow.",
    "Summarize the changes and checks, including any live validation still required. Explain before a default-branch push if auto-deploy is enabled because that push publishes the app. Follow the project's existing commit and publishing instructions; use the CU Launch access and authorization guidance above for requested portal actions.",
  ].join("\n\n");
}
