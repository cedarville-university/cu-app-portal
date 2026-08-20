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
    '- On macOS, tell me to open "CedarNet 2.0", search for "Git", and select Install.',
    "- Completely quit and reopen Codex after installation finishes, reopen this local project, and return to this task.",
    "- Then stop and wait. Do not run repository commands until I return and git --version succeeds.",
    "Use only HTTPS repository URLs. When GitHub authentication is required, let Git open its secure browser or operating-system sign-in and ask me only to complete that sign-in window.",
    "Do not use the GitHub plugin or GitHub CLI as an authentication fallback.",
    "Never ask for a GitHub password, personal access token, or SSH key. Never place credentials in a command or repository URL.",
    "If secure browser or operating-system sign-in does not appear or does not succeed, stop and explain that GitHub sign-in needs Cedarville IT help. Do not try another credential method.",
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
  } = {},
) {
  const prompt = [
    "Who you are helping",
    "The person I am helping is a beginner who may not know Git, repositories, branches, commits, pull requests, Azure, or publishing.",
    "Explain what you are doing in everyday language.",
    "",
    "Your goal",
    `Make safe changes to "${appName}" for Cedarville App Portal request ${requestId}.`,
    "You own the technical workflow: inspect the app, make the changes, and verify the result.",
    "",
    "Safety rules",
    "Do not ask me to type terminal or Git commands. Run the technical commands yourself.",
    "Ask only one question at a time, and only when a true human choice is needed.",
    "Never ask for my passwords or secret values. Do not expose, copy, commit, or paste credentials, tokens, or other secrets.",
    "Do not ask for portal credentials.",
    ...managedGitReadinessInstructions(appName),
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
      "Use the verified portal remote when preparing work for Cedarville App Portal publishing.",
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
    "Use the managed repository as the source of truth, inspect the existing files, and make only safe, relevant changes.",
    "Use `.codex/skills/cu-app-portal/SKILL.md` for portal-managed app workflow guidance.",
  );

  prompt.push(
    "",
    "Before you finish",
    "Before you finish, run the relevant tests, explain the result plainly, then commit and push the completed work through the portal-supported workflow.",
    "Verify that the push succeeded and give me a simple status summary.",
    "When the code is ready, return to the Cedarville App Portal.",
    "Return to the portal and select Publish to Azure.",
  );

  return prompt.join("\n");
}

export function buildLocalCodexGitSetupPrompt({
  repositoryUrl,
  appName,
  requestId,
  defaultBranch = "main",
  preparationErrorSummary,
}: {
  repositoryUrl: string;
  appName: string;
  requestId: string;
  defaultBranch?: string | null;
  preparationErrorSummary?: string | null;
}) {
  const branch = defaultBranch ?? "main";

  const prompt = [
    "Who you are helping",
    "The person I am helping is a beginner who may not know Git, repositories, branches, commits, pull requests, Azure, or publishing.",
    "Explain what you are doing in everyday language.",
    "",
    "Your goal",
    `Connect the local "${appName}" project to the Cedarville App Portal managed repository for request ${requestId}.`,
    "You own the technical workflow: inspect the app, connect and upload the code safely, and verify the result.",
    "",
    "Safety rules",
    "Do not ask me to type terminal or Git commands. Run the technical commands yourself.",
    "Ask only one question at a time, and only when a true human choice is needed.",
    "Never ask for my passwords or secret values. Do not expose, copy, commit, or paste credentials, tokens, or other secrets.",
    ...managedGitReadinessInstructions(appName),
    "",
    "Work to perform",
    `Managed repository: ${repositoryUrl}`,
    `Use ${branch} as the portal branch.`,
    `Confirm that the local Codex project primary folder is the existing app folder for "${appName}". Verify this from the folder contents and explain what you recognize in everyday language.`,
    "Do not initialize Git, change remotes, stage files, or edit the app until both checks pass: this is the intended app folder, and git --version succeeds.",
    "Inspect the local project, its Git status, existing remotes, and existing commits. First, preserve any existing Git history and remotes.",
    "Check that secret and local environment files are excluded before staging anything.",
    "If Git is not initialized, initialize it before creating the initial commit:",
    "git init",
    `git branch -M ${branch}`,
    "Inspect candidate files with git status before staging.",
    "After reviewing them, stage only intentional source, configuration, and documentation files by explicit path. Do not use a broad catch-all staging command.",
    "Re-check the staged file names and diff with git diff --cached --name-only and git diff --cached.",
    "Unstage anything sensitive or local before committing with git rm --cached -- <path>; this removes it from the staged list without deleting the local file and works before the first commit.",
    'git commit -m "Initial app source"',
    "Check whether a remote named portal already exists and inspect its URL:",
    "git remote get-url portal",
    `Verify that its URL exactly matches ${repositoryUrl} before using it for any push.`,
    "Never push to an existing portal remote whose URL does not exactly match the managed repository.",
    "If portal does not exist, add it with this exact managed repository URL:",
    `git remote add portal ${repositoryUrl}`,
    "If portal exists with a different URL and is clearly an obsolete portal entry, record the old URL and update only that remote with git remote set-url portal <managed-repository-url>.",
    "If the existing portal remote may still be useful, preserve that remote and choose an unused, unambiguous name such as portal-managed (or portal-managed-2 if needed). Do not rename, delete, or overwrite other remotes.",
    "Run git remote get-url <verified-managed-remote> and confirm it exactly matches the managed repository before continuing.",
    "Push the current local code to the portal-managed repository:",
    `git push -u <verified-managed-remote> HEAD:${branch}`,
    "After the push succeeds, use `.codex/skills/cu-app-portal/SKILL.md` for portal-managed app workflow guidance.",
    "",
    "Before you finish",
    "Before you finish, run the relevant tests, explain the result plainly, then commit and push the completed work through the portal-supported workflow.",
    `Verify that the push succeeded, and report the repository and branch that received the push: ${repositoryUrl} (${branch}).`,
    "Give me a simple status summary.",
    "When the code is ready, return to the Cedarville App Portal.",
    preparationErrorSummary
      ? `Return to the portal and select "${LOCAL_REPAIR_CONFIRMATION_LABEL}".`
      : `Return to the portal and select ${LOCAL_UPLOAD_CONFIRMATION_LABEL}.`,
  ];

  if (preparationErrorSummary) {
    prompt.splice(
      prompt.indexOf("Work to perform"),
      0,
      "Repair needed before uploading again",
      "The portal inspected the previous upload and found a deterministic compatibility problem. Repair the app itself before pushing and confirming another upload; repeating the same portal action without code changes will not help.",
      `Portal feedback: ${preparationErrorSummary}`,
      "Inspect that feedback, make the smallest safe source-code or runtime change that resolves it, and run the relevant tests before continuing with the upload steps below.",
      "",
    );
  }

  return prompt.join("\n");
}
