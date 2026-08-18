export function buildCodexHandoffPrompt(
  repositoryUrl: string,
  appName: string,
  requestId: string,
  options: {
    defaultBranch?: string | null;
    sourceRepositoryUrl?: string | null;
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
    "Use my connected GitHub account in Codex if GitHub access is required; do not ask for portal credentials.",
    "",
    "Work to perform",
    `Open the managed GitHub repository ${repositoryUrl}.`,
    "Use the managed repository as the source of truth, inspect the existing files, and make only safe, relevant changes.",
    "Use `.codex/skills/cu-app-portal/SKILL.md` for portal-managed app workflow guidance.",
  ];

  if (options.sourceRepositoryUrl) {
    const defaultBranch = options.defaultBranch ?? "main";

    prompt.push(
      "",
      `This app was imported from ${options.sourceRepositoryUrl}.`,
      "Keep the existing origin remote pointed at the source repository.",
      "Add the portal-managed repository as a separate remote named portal:",
      `git remote add portal ${repositoryUrl}`,
      "git fetch portal",
      `git pull portal ${defaultBranch}`,
      `git push portal HEAD:${defaultBranch}`,
      "Use the portal remote when preparing work for Cedarville App Portal publishing.",
    );
  }

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
    "Do not require the GitHub CLI.",
    "",
    "Work to perform",
    `Managed repository: ${repositoryUrl}`,
    `Use ${branch} as the portal branch.`,
    "Check whether the git command is available locally. If git is not installed, help me install Git first using the official installer or package manager for my operating system (https://git-scm.com/downloads/), then continue with the setup.",
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
    "Return to the portal and select My code has been uploaded.",
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
