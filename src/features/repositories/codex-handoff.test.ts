import { describe, expect, it } from "vitest";
import {
  buildCodexHandoffPrompt,
  buildLocalCodexGitSetupPrompt,
} from "./codex-handoff";

describe("buildCodexHandoffPrompt", () => {
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
    expect(prompt).toContain(
      "git remote add portal https://github.com/cedarville-it/campus-dashboard",
    );
    expect(prompt).toContain("git fetch portal");
    expect(prompt).toContain("git pull portal trunk");
    expect(prompt).toContain("git push portal HEAD:trunk");
    expect(prompt).toContain(
      "Use the portal remote when preparing work for Cedarville App Portal publishing.",
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
    expect(prompt).toContain("return to the Cedarville App Portal");
    expect(prompt).toContain("Return to the portal and select Publish to Azure");
  });
});

describe("buildLocalCodexGitSetupPrompt", () => {
  it("tells Codex to help install Git before local repository setup when needed", () => {
    const prompt = buildLocalCodexGitSetupPrompt({
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      appName: "Campus Dashboard",
      requestId: "req_local",
      defaultBranch: "main",
    });

    expect(prompt).toContain("Do not require the GitHub CLI.");
    expect(prompt).toContain("If git is not installed");
    expect(prompt).toContain("help me install Git first");
    expect(prompt).toContain("https://git-scm.com/downloads/");
    expect(prompt).toContain(
      "git remote add portal https://github.com/cedarville-it/campus-dashboard",
    );
    expect(prompt).toContain("git push -u portal HEAD:main");
    expect(prompt).toContain(
      "After the push succeeds, use `.codex/skills/cu-app-portal/SKILL.md` for portal-managed app workflow guidance.",
    );
    expect(prompt).toContain("The person I am helping is a beginner");
    expect(prompt).toContain("Do not ask me to type terminal or Git commands");
    expect(prompt).toContain("Ask only one question at a time");
    expect(prompt).toContain("Never ask for my passwords or secret values");
    expect(prompt).toContain("run the relevant tests");
    expect(prompt).toContain("commit and push");
    expect(prompt).toContain("return to the Cedarville App Portal");
    expect(prompt).toContain("preserve any existing Git history");
    expect(prompt).toContain("report the repository and branch that received the push");
    expect(prompt).toContain("Return to the portal and select My code has been uploaded");
  });
});
