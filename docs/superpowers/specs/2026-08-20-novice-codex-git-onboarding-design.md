# Novice Codex and Git Onboarding Design

## Goal

Make the first Codex-to-GitHub handoff safe and understandable for people who have little or no coding or publishing experience, while preserving a real local Git repository and its version history.

## User flow

The portal prepares the user before it presents a Codex prompt:

1. Confirm Git is installed from Cedarville-managed software: **Company Portal** on Windows or **CedarNet 2.0** on macOS.
2. Completely quit and reopen Codex after Git is installed.
3. Create or open a **local Codex project** for the app and make the app folder its primary folder.
4. Start the task inside that project. Do not use Quick chat or a standalone task.
5. Paste the portal prompt only after the correct project is open.

For a generated app, the user creates a new empty folder for the app and uses it as the local project's primary folder. For an app already on the computer, the user creates a local project from the existing app folder and makes that folder primary.

## Prompt behavior

Every Git handoff prompt must assume the user is a beginner and must:

- verify it is running inside the intended local Codex project's primary folder before changing files;
- run `git --version` before any repository operation;
- if Git is unavailable, stop, ask which operating system the user has, give only the matching Company Portal or CedarNet 2.0 instructions, and wait for the user to install Git and reopen Codex;
- never attempt to install Git, use a package manager, or download an installer;
- use HTTPS Git operations and the operating system/browser credential flow for GitHub sign-in;
- never ask for a GitHub password, personal access token, SSH key, portal credential, or other secret;
- never use the GitHub plugin or require GitHub CLI as a fallback;
- perform the Git work for the user and explain checkpoints and failures in everyday language.

Generated-app prompts may clone into the current primary folder only after confirming it is the intended empty folder. Local-app prompts preserve existing files, Git history, and remotes.

## Portal copy

The Codex customization, local upload, and local repair screens show a short **Before opening Codex** checklist. The copy explains that Git stores change history on the computer, GitHub stores the managed online copy used for publishing, and a local Codex project keeps Codex attached to the correct app folder.

The instruction is phrased accurately for the Codex interface: **Do not use Quick chat or start a standalone task. Create or open the local project first, then start this task inside it.**

## Documentation and verification

README, portal setup documentation, user Quick Start, full guide, troubleshooting, and FAQ remain aligned with the UI. Downloadable PDFs are regenerated from the user Markdown sources and checked for valid structure and readable layout.

