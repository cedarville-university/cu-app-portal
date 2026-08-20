import { describe, expect, it } from "vitest";
import {
  buildCodexHandoffPrompt,
  buildLocalCodexGitSetupPrompt,
} from "./codex-handoff";

function expectOrderedSections(prompt: string) {
  const sectionIndexes = [
    "Who you are helping",
    "Your goal",
    "Safety rules",
    "Work to perform",
    "Before you finish",
  ].map((section) => prompt.indexOf(section));

  sectionIndexes.forEach((index) => expect(index).toBeGreaterThan(-1));
  sectionIndexes.slice(1).forEach((index, position) => {
    expect(index).toBeGreaterThan(sectionIndexes[position]);
  });
}

function expectManagedGitReadiness(prompt: string) {
  expect(prompt).toContain("local Codex project");
  expect(prompt).toContain("primary folder");
  expect(prompt).toContain("Quick chat");
  expect(prompt).toContain("standalone task");
  expect(prompt).toContain("git --version");
  expect(prompt).toContain("Company Portal");
  expect(prompt).toContain("CedarNet 2.0");
  expect(prompt).toContain("Completely quit and reopen Codex");
  expect(prompt).toContain("Do not attempt to install Git");
  expect(prompt).toContain("stop and wait");
  expect(prompt).toContain("HTTPS");
  expect(prompt).toContain("secure browser or operating-system sign-in");
  expect(prompt).toContain("Do not use the GitHub plugin or GitHub CLI");
  expect(prompt).toContain(
    "Never ask for a GitHub password, personal access token, or SSH key",
  );
  expect(prompt).not.toContain("help me install Git");
  expect(prompt).not.toContain("https://git-scm.com/downloads/");
  expect(prompt).not.toContain("package manager");
}

function expectCodexRuntimeAndPortalBoundaries(prompt: string) {
  expect(prompt).toContain("load_workspace_dependencies");
  expect(prompt).toContain("bundled workspace runtimes");
  expect(prompt).toContain("Node.js");
  expect(prompt).toContain("Python");
  expect(prompt).toContain(
    "Do not report that tests cannot run until you have checked both the system commands and the bundled workspace dependencies",
  );
  expect(prompt).toContain(
    "Do not use Browser, Computer Use, Chrome, plugins, or connectors to access the Cedarville App Portal",
  );
  expect(prompt).toContain("Portal navigation and button clicks are my job");
  expect(prompt).not.toContain(
    "Return to the portal and select Publish to Azure",
  );
}

describe("buildCodexHandoffPrompt", () => {
  it("prepares an empty local Codex project before cloning a generated app", () => {
    const prompt = buildCodexHandoffPrompt(
      "https://github.com/cedarville-it/campus-dashboard",
      "Campus Dashboard",
      "req_generated",
      { defaultBranch: "main" },
    );

    expectManagedGitReadiness(prompt);
    expect(prompt).toContain(
      'Confirm that the primary folder is the new empty folder intended for "Campus Dashboard".',
    );
    expect(prompt).toContain("must contain no files or subfolders");
    expect(prompt).not.toContain("harmless Codex project metadata");
    expect(prompt).toContain(
      "Do not delete, move, or overwrite unexpected files to make the folder appear empty",
    );
    expect(prompt).toContain(
      "git clone https://github.com/cedarville-it/campus-dashboard .",
    );
    expect(prompt).toContain("git remote get-url origin");
    expect(prompt.indexOf("git --version")).toBeLessThan(
      prompt.indexOf(
        "git clone https://github.com/cedarville-it/campus-dashboard .",
      ),
    );
    expectCodexRuntimeAndPortalBoundaries(prompt);
    expect(prompt).toContain(
      'Ask exactly one question: "The project is ready. What would you like me to change or build in this project?"',
    );
    expect(prompt).toContain(
      "Stop and wait for my answer before modifying app files",
    );
    expect(prompt).toContain(
      "Do not assume that publishing is the next task",
    );
    expect(prompt.indexOf("git remote get-url origin")).toBeLessThan(
      prompt.indexOf("The project is ready. What would you like me to change"),
    );
  });

  it("safely reuses a verified generated-app checkout after publication", () => {
    const prompt = buildCodexHandoffPrompt(
      "https://github.com/cedarville-it/campus-dashboard",
      "Campus Dashboard",
      "req_published",
      { defaultBranch: "main", localFolderMode: "new-or-existing" },
    );

    expectManagedGitReadiness(prompt);
    expect(prompt).toContain("either empty or the existing local checkout");
    expect(prompt).toContain("If the primary folder is empty");
    expect(prompt).toContain("If the primary folder already contains the app");
    expect(prompt).toContain("git remote get-url origin");
    expect(prompt).toContain("git status --short");
    expect(prompt).toContain("git pull --ff-only origin main");
    expect(prompt).toContain(
      "If there are uncommitted changes, stop and explain them",
    );
    expect(prompt).toContain(
      "git clone https://github.com/cedarville-it/campus-dashboard .",
    );
  });

  it("includes portal remote instructions for successfully imported repos", () => {
    const prompt = buildCodexHandoffPrompt(
      "https://github.com/cedarville-it/campus-dashboard",
      "Campus Dashboard",
      "req_123",
      {
        defaultBranch: "trunk",
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
      },
    );

    expect(prompt).toContain(
      "This app was imported from https://github.com/example/campus-dashboard.",
    );
    expect(prompt).toContain(
      "Keep the existing origin remote pointed at the source repository.",
    );
    expect(prompt).toContain("git remote get-url portal");
    expect(prompt).toContain(
      "Verify that the selected portal remote URL exactly matches https://github.com/cedarville-it/campus-dashboard",
    );
    expect(prompt).toContain("preserve it and choose an unused name");
    expect(prompt).toContain("git status --short");
    expect(prompt).toContain("git fetch <verified-portal-remote>");
    expect(prompt).toContain(
      "git pull --ff-only <verified-portal-remote> trunk",
    );
    expect(prompt).toContain(
      "git push <verified-portal-remote> HEAD:trunk",
    );
    expect(prompt).not.toContain("git pull portal trunk");
    expect(prompt).toContain(
      "Use the verified portal remote when preparing work for Cedarville App Portal publishing.",
    );
    expect(prompt).toContain(
      "Use `.codex/skills/cu-app-portal/SKILL.md` for portal-managed app workflow guidance.",
    );
    expect(prompt).toContain("The person I am helping is a beginner");
    expect(prompt).toContain("Do not ask me to type terminal or Git commands");
    expect(prompt).toContain("Ask only one question at a time");
    expect(prompt).toContain("Never ask for my passwords or secret values");
    expect(prompt).toContain("run the relevant tests");
    expect(prompt).toContain("commit and push");
    expectManagedGitReadiness(prompt);
    expectCodexRuntimeAndPortalBoundaries(prompt);
    expect(prompt).toContain(
      'Confirm that the primary folder contains the existing local checkout for "Campus Dashboard".',
    );
    expectOrderedSections(prompt);
    expect(prompt.indexOf("Safety rules")).toBeLessThan(
      prompt.indexOf("Confirm that the primary folder contains"),
    );
  });
});

describe("buildLocalCodexGitSetupPrompt", () => {
  it("stops for managed Git installation before local repository setup when needed", () => {
    const prompt = buildLocalCodexGitSetupPrompt({
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      appName: "Campus Dashboard",
      requestId: "req_local",
      defaultBranch: "main",
    });

    expectManagedGitReadiness(prompt);
    expectCodexRuntimeAndPortalBoundaries(prompt);
    expect(prompt).toContain(
      'Confirm that the local Codex project primary folder is the existing app folder for "Campus Dashboard".',
    );
    expect(prompt).toContain(
      "Do not initialize Git, change remotes, stage files, or edit the app until both checks pass",
    );
    expect(prompt).toContain("git remote get-url portal");
    expect(prompt).toContain(
      "Verify that its URL exactly matches https://github.com/cedarville-it/campus-dashboard",
    );
    expect(prompt).toContain(
      "Never push to an existing portal remote whose URL does not exactly match",
    );
    expect(prompt).toContain(
      "preserve that remote and choose an unused, unambiguous name",
    );
    expect(prompt).toContain(
      "git push -u <verified-managed-remote> HEAD:main",
    );
    expect(prompt).not.toContain("git push -u portal HEAD:main");
    expect(prompt.indexOf("git remote get-url portal")).toBeLessThan(
      prompt.indexOf("git push -u <verified-managed-remote> HEAD:main"),
    );
    expect(prompt).toContain(
      "After the push succeeds, use `.codex/skills/cu-app-portal/SKILL.md` for portal-managed app workflow guidance.",
    );
    expect(prompt).toContain("The person I am helping is a beginner");
    expect(prompt).toContain("Do not ask me to type terminal or Git commands");
    expect(prompt).toContain("Ask only one question at a time");
    expect(prompt).toContain("Never ask for my passwords or secret values");
    expect(prompt).toContain("run the relevant tests");
    expect(prompt).toContain("commit and push");
    expect(prompt).toContain(
      "tell me that I can return to the Cedarville App Portal",
    );
    expect(prompt).toContain("preserve any existing Git history");
    expect(prompt).toContain("report the repository and branch that received the push");
    expect(prompt).toContain(
      'tell me to select "My code has been uploaded" myself',
    );
    expect(prompt).not.toContain("git add .");
    expect(prompt).toContain("Inspect candidate files with git status");
    expect(prompt).toContain("stage only intentional source, configuration, and documentation files by explicit path");
    expect(prompt).toContain("Re-check the staged file names and diff");
    expect(prompt).toContain("Unstage anything sensitive or local before committing");
    expect(prompt).not.toContain("git restore --staged");
    expect(prompt).toContain("git rm --cached -- <path>");
    expect(prompt).toContain("without deleting the local file");
    expectOrderedSections(prompt);
    expect(prompt.indexOf("Safety rules")).toBeLessThan(
      prompt.indexOf("Managed repository:"),
    );
  });
});
