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
}: {
  repositoryUrl: string;
  appName: string;
  requestId: string;
  defaultBranch?: string | null;
}) {
  const branch = defaultBranch ?? "main";

  return [
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
    "If Git is not initialized, initialize it and create the initial commit without adding secret or local environment files:",
    "git init",
    `git branch -M ${branch}`,
    "git add .",
    'git commit -m "Initial app source"',
    "Add the portal-managed repository as a remote named portal if it is not already configured:",
    `git remote add portal ${repositoryUrl}`,
    "Push the current local code to the portal-managed repository:",
    `git push -u portal HEAD:${branch}`,
    "After the push succeeds, use `.codex/skills/cu-app-portal/SKILL.md` for portal-managed app workflow guidance.",
    "",
    "Before you finish",
    "Before you finish, run the relevant tests, explain the result plainly, then commit and push the completed work through the portal-supported workflow.",
    `Verify that the push succeeded, and report the repository and branch that received the push: ${repositoryUrl} (${branch}).`,
    "Give me a simple status summary.",
    "When the code is ready, return to the Cedarville App Portal.",
    "Return to the portal and select My code has been uploaded.",
  ].join("\n");
}
