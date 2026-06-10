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
    `Open the managed GitHub repository ${repositoryUrl}.`,
    `This repo was created by the Cedarville App Portal for "${appName}" (request ${requestId}).`,
    "Use the managed repository as the source of truth, review the existing files, and help me customize the app.",
    "If GitHub access is required, use my connected GitHub account in Codex rather than asking for portal credentials.",
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
  return [
    `I have a local Codex-built app named "${appName}" that needs to be connected to the Cedarville App Portal managed GitHub repository.`,
    `Portal request: ${requestId}`,
    `Managed repository: ${repositoryUrl}`,
    "",
    "Do not require the GitHub CLI.",
    "In the local project folder, inspect whether git is already initialized and whether there are existing commits/remotes.",
    "If git is not initialized, run:",
    "git init",
    `git branch -M ${defaultBranch ?? "main"}`,
    "git add .",
    'git commit -m "Initial app source"',
    "",
    "Add the portal-managed repository as a remote named portal if it is not already configured:",
    `git remote add portal ${repositoryUrl}`,
    "",
    "Push the current local code to the portal-managed repository:",
    `git push -u portal HEAD:${defaultBranch ?? "main"}`,
    "",
    "After the push succeeds, tell me to return to the Cedarville App Portal and apply or review the Azure publishing setup.",
  ].join("\n");
}
