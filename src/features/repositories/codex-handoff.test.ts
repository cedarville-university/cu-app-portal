import { describe, expect, it } from "vitest";
import {
  buildCodexHandoffPrompt,
  buildLoginUpdatePrompt,
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
  expect(prompt).toContain("Cedarville login scripts");
  expect(prompt).toContain("Completely quit and reopen Codex");
  expect(prompt).toContain("Do not attempt to install Git");
  expect(prompt).toContain("stop and wait");
  expect(prompt).toContain("HTTPS");
  expect(prompt).toContain("secure browser or operating-system sign-in");
  const recoverySteps = [
    "1. Try existing Git authentication",
    "2. Diagnose and repair credential handling",
    "3. Try the GitHub plugin",
    "4. Try GitHub CLI",
    "5. Complete required sign-in",
    "6. Verify recovery or explain the remaining blocker",
  ];
  const recoveryIndexes = recoverySteps.map((step) => prompt.indexOf(step));
  recoveryIndexes.forEach((index) => expect(index).toBeGreaterThan(-1));
  recoveryIndexes.slice(1).forEach((index, position) => {
    expect(index).toBeGreaterThan(recoveryIndexes[position]);
  });
  expect(prompt).toContain("git config --show-origin --get-all credential.helper");
  expect(prompt).toContain("osxkeychain");
  expect(prompt).toContain("git credential-manager configure");
  expect(prompt).toContain("changes user-level Git configuration");
  expect(prompt).toContain("Plugin access does not authenticate local Git");
  expect(prompt).toContain("gh auth status --hostname github.com");
  expect(prompt).toContain("user-writable tools directory");
  expect(prompt).toContain("gh auth login --hostname github.com --git-protocol https --web");
  expect(prompt).toContain("gh auth git-credential");
  expect(prompt).toContain("gh still requires Git to clone");
  expect(prompt).toContain("Do not repeat unchanged failed attempts");
  expect(prompt).toContain("Do not disable TLS verification");
  expect(prompt).toContain("Do not claim write access from a successful clone");
  expect(prompt).not.toContain("Do not use the GitHub plugin or GitHub CLI");
  expect(prompt).not.toContain("Do not try another credential method");
  expect(prompt).toContain(
    "Never ask for a GitHub password, personal access token, or SSH key",
  );
  expect(prompt).not.toContain("help me install Git");
  expect(prompt).not.toContain("https://git-scm.com/downloads/");
  expect(prompt).toContain("existing package manager");
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
    "Ask for my permission before using the CU Launch plugin or connector",
  );
  expect(prompt).toContain("wait for my approval before calling any of its tools");
  expect(prompt).toContain("Browser, Computer Use, and Chrome may access and operate CU Launch when I ask for that method");
  expect(prompt).toContain("Do not infer authorization for those actions from repository setup or code changes alone");
  expect(prompt).not.toContain("Do not open or operate CU Launch");
  expect(prompt).not.toContain("CU Launch navigation and button clicks are my job");
  expect(prompt).not.toContain(
    "Return to the portal and select Publish to Azure",
  );
}

describe("buildCodexHandoffPrompt", () => {
  it("gives Express apps an OIDC update prompt without Next.js-specific instructions", () => {
    const prompt = buildLoginUpdatePrompt({
      repositoryUrl: "https://github.com/org/bookmarks",
      appName: "GO Bookmark Designer",
      framework: "express",
    });
    expect(prompt).toContain("Express");
    expect(prompt).toContain("openid-client");
    expect(prompt).toContain("CSRF");
    expect(prompt).toContain("state, nonce, and PKCE");
    expect(prompt).toContain("/api/auth/callback/microsoft-entra-id");
    expect(prompt).toContain("If the equivalent login flow is already present");
    expect(prompt).not.toContain("server action");
    expect(prompt).not.toContain("pages: { signIn:");
    expect(prompt).not.toContain("AuthError");
    expect(prompt).not.toContain("If this is not a Next.js app");
    expectCodexRuntimeAndPortalBoundaries(prompt);
  });
  it("preserves custom Next.js login in handoffs and provides an actionable existing-app update", () => {
    const handoff = buildCodexHandoffPrompt("https://github.com/org/app", "Campus App", "req");
    expect(handoff).toContain("/login");
    expect(handoff).toContain("server action");
    const prompt = buildLoginUpdatePrompt({ repositoryUrl: "https://github.com/org/app", appName: "Campus App" });
    expect(prompt).toContain("https://github.com/org/app");
    expect(prompt).toContain('pages: { signIn: "/login" }');
    expect(prompt).toContain("/api/auth/callback/microsoft-entra-id");
    expect(prompt).toContain("Do not claim");
    expect(prompt).not.toContain("The project is ready. What would you like me to change");
    expectCodexRuntimeAndPortalBoundaries(prompt);
  });
  it("prepares an empty local Codex project before cloning a generated app", () => {
    const prompt = buildCodexHandoffPrompt(
      "https://github.com/cedarville-it/campus-dashboard",
      "Campus Dashboard",
      "req_generated",
      { defaultBranch: "main" },
    );

    expectManagedGitReadiness(prompt);
    expect(prompt).toContain(
      "Cedarville App Portal request req_generated",
    );
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
      "Use the verified portal remote when preparing work for CU Launch publishing.",
    );
    expect(prompt).toContain(
      "Use `.codex/skills/cu-app-portal/SKILL.md` for CU Launch-managed app workflow guidance.",
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
    expect(prompt).toContain(
      "git pull --no-rebase <verified-managed-remote> main",
    );
    expect(prompt).toContain(
      "If the local repository already has commits that do not share history with the managed repository",
    );
    expect(prompt).toContain("--allow-unrelated-histories");
    expect(prompt).not.toContain("git push -u portal HEAD:main");
    expect(prompt.indexOf("git pull --no-rebase <verified-managed-remote> main")).toBeLessThan(
      prompt.indexOf("Read `.codex/skills/cu-app-portal/SKILL.md`"),
    );
    expect(prompt.indexOf("Read `.codex/skills/cu-app-portal/SKILL.md`")).toBeLessThan(
      prompt.indexOf("Inspect the local app using the compatibility and safe-migration workflow"),
    );
    expect(prompt.indexOf("git remote get-url portal")).toBeLessThan(
      prompt.indexOf("git push -u <verified-managed-remote> HEAD:main"),
    );
    expect(prompt).not.toContain(
      "After the push succeeds, use `.codex/skills/cu-app-portal/SKILL.md`",
    );
    expect(prompt).toContain("The person I am helping is a beginner");
    expect(prompt).toContain("Do not ask me to type terminal or Git commands");
    expect(prompt).toContain("Ask only one question at a time");
    expect(prompt).toContain("Never ask for my passwords or secret values");
    expect(prompt).toContain("run the relevant tests");
    expect(prompt).toContain("commit and push");
    expect(prompt).toContain(
      "tell me that I can return to CU Launch",
    );
    expect(prompt).toContain("preserve any existing Git history");
    expect(prompt).toContain("report the repository and branch that received the push");
    expect(prompt).toContain(
      'explain that the next CU Launch action is "My code has been uploaded"',
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

  it("makes static package.json repair guidance self-contained", () => {
    const prompt = buildLocalCodexGitSetupPrompt({
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      appName: "Campus Dashboard",
      requestId: "req_local",
      defaultBranch: "main",
      preparationErrorSummary:
        "Repository must be a root Next.js, Express, FastAPI, or Python static app.",
    });

    expect(prompt).toContain("A root index.html alone is not enough");
    expect(prompt).toContain(
      "A plain static app must not contain package.json, requirements.txt, or pyproject.toml",
    );
    expect(prompt).toContain(
      "Do not add app-portal/http_server_start.py before uploading the repair",
    );
  });
});


describe("Git commit author identity", () => {
  it("includes the acting user's identity in customization and local upload prompts", () => {
    const gitAuthor = { githubUsername: "cedar-developer", email: "developer@cedarville.edu" };
    const prompts = [
      buildCodexHandoffPrompt("https://github.com/cedarville/app", "App", "request", { gitAuthor }),
      buildLocalCodexGitSetupPrompt({ repositoryUrl: "https://github.com/cedarville/app", appName: "App", requestId: "request", gitAuthor }),
    ];
    for (const prompt of prompts) {
      expect(prompt).toContain('Git user.name: "cedar-developer"');
      expect(prompt).toContain('Git user.email: "developer@cedarville.edu"');
      expect(prompt).toContain("git config --local");
      expect(prompt).toContain("before any commit or pull that may create a merge commit");
      expect(prompt).toContain("Do not change global Git settings");
      expect(prompt).toContain("they do not authenticate GitHub pushes");
    }
  });

  it("asks for missing author details instead of inventing them", () => {
    const prompt = buildCodexHandoffPrompt("https://github.com/cedarville/app", "App", "request");
    expect(prompt).toContain("Git user.name: null");
    expect(prompt).toContain("Git user.email: null");
    expect(prompt).toContain("do not invent a value");
  });
});


it("turns selected import services into concrete project work in both handoffs", () => {
  const importFeatures = { databaseProvider: "postgresql", entraLogin: true } as const;
  const prompts = [
    buildCodexHandoffPrompt("https://github.com/cedarville-it/app", "App", "req", { importFeatures }),
    buildLocalCodexGitSetupPrompt({ repositoryUrl: "https://github.com/cedarville-it/app", appName: "App", requestId: "req", importFeatures }),
  ];
  for (const prompt of prompts) {
    expect(prompt).toContain("DATABASE_URL");
    expect(prompt).toContain("server-side");
    expect(prompt).toContain("/auth/callback");
    expect(prompt).toContain("/api/health");
    expectCodexRuntimeAndPortalBoundaries(prompt);
    expect(prompt).not.toContain('Ask exactly one question: "The project is ready. What would you like me to change or build in this project?"');
  }
});
