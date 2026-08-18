---
title: User Guide
description: Detailed instructions for creating, managing, and publishing apps with the Cedarville App Portal.
lastReviewed: 2026-08-18
owner: Cedarville IT
---

# Cedarville App Portal User Guide

This guide explains the complete app lifecycle in plain language. Start with the [Quick Start](/help/quick-start) if you only need the shortest path to a first published app.

## 1. What the portal does

The Cedarville App Portal brings the main pieces of an app into one managed workflow. It can create starter code from an approved template, keep that code in a managed GitHub repository, prepare Azure hosting, publish the app, and help you manage access afterward.

The portal does not design every screen or write every business rule for you. After creating the starter, you can work with Codex or a developer to customize the app. GitHub remains the supported source of truth: the version stored there is the version Cedarville tools review and publish.

## 2. Understand the app lifecycle

1. **Create or add:** Select **Create New App** for a template or **Add Existing App** for code that already exists.
2. **Customize:** Use Codex or a developer to change the managed GitHub repository.
3. **Prepare:** The portal adds and checks the settings needed for GitHub and Azure to work together.
4. **Publish:** The portal starts the GitHub workflow that sends the current app to Azure.
5. **Manage:** Before the first successful publish, use **Continue Setup**. After success, use **Manage App** for the full details and management controls.

## 3. Choose the right starting point

### Create New App

Choose **Create New App** when you are starting a new project and want Cedarville-approved defaults. The entry page first explains that choosing a template is the next step. Recommended Templates are written for common, non-technical use cases. Developer Starters expose lower-level choices and are better when a developer already knows the intended architecture.

Common template capabilities include:

- A PostgreSQL database for information the app must save.
- Microsoft Entra login when only authorized Cedarville users should enter the app.
- A web interface for forms, trackers, and information pages.
- An API or automation service for a system-to-system process without a normal web page.

Selecting a database or login adds infrastructure and configuration. Choose it because the app needs it, not because it sounds useful.

### Add Existing App

Choose **Add Existing App** when code already exists.

- **Already on GitHub:** Give the portal the repository address. If necessary, the portal imports it into Cedarville's managed GitHub organization while preserving its history. The portal checks whether it matches a supported Azure App Service runtime.
- **Only on my computer:** Let the portal create an empty managed repository. The focused wizard provides a prompt that makes Codex responsible for checking the folder, protecting secrets, preserving existing change history, connecting the managed repository, and uploading the code.

Imported apps currently support root Next.js, Express, Python FastAPI, and plain static Python apps. A repository with conflicting publishing files may require a GitHub review page before the portal applies its setup.

## 4. Create and choose what happens next

1. From the home page, select **Create New App** and then **Choose an app template**.
2. Read the template summaries and select the closest match.
3. Enter a short, recognizable app name. Avoid department abbreviations that coworkers may not understand.
4. Describe the app's purpose and intended users.
5. Review optional database and login choices.
6. Select **Create App**. Creation stops before publishing.

When **Your starter app is ready** appears, choose **Publish the starter now** or **Customize it with Codex first**.

**Publish the starter now** is the quickest route and does not require your own GitHub account. **Customize it with Codex first** starts the GitHub access and Codex handoff steps. Codex is optional; the portal never assumes that customization is required.

## 5. GitHub access and Codex customization

GitHub is the managed online location for the app's code. It records changes and lets Cedarville's publishing workflow use a reviewed source.

If you choose customization, the wizard asks whether you already have a GitHub account. A GitHub account is a login for the website where the app's private code home is stored. To continue:

1. Create an account from the supplied GitHub link if needed, then return to the same portal tab.
2. Enter the GitHub username for that account and select **Send repository invite**.
3. Accept the private repository invitation on GitHub.
4. Return and select **I've accepted the invitation**.
5. Copy the complete prompt into Codex. Let Codex inspect, change, test, commit, and push the app.
6. Return only after Codex reports that the push succeeded.

Portal collaboration and GitHub access are separate. Confirm that finished changes are committed and pushed to the managed repository; the portal cannot publish local files that were never pushed.

## 6. Add code that already exists

### Already on GitHub

Paste the repository's web address and give the app a recognizable name. The portal makes or reuses the managed Cedarville copy, preserves the source history, and checks whether it matches a supported Azure runtime. It supports root Next.js, Express, Python FastAPI, and plain static Python apps.

Select **Prepare my app for publishing** when offered. The portal adds only the publishing files the app needs. If existing files conflict, it does not overwrite them. Select **Open a safe review on GitHub** to create a pull request, which is a GitHub page showing proposed changes. Review and merge it, then select **I've approved the changes** so the portal can verify them.

### Only on my computer

Enter the local app name and select **Create online home**. Follow the GitHub account or invitation steps if shown, copy the local-upload prompt into Codex, and open the app folder in Codex. Codex owns the technical upload: it checks for secrets, preserves existing Git history and remotes, tests the app, and pushes it to the managed repository. Select **My code has been uploaded** only after Codex reports success.

The portal then scans and prepares the uploaded code. If the runtime is unsupported, it returns a repair prompt to Codex. After Codex repairs, tests, and uploads the app, select **I've repaired and uploaded my code**. Do not use either confirmation before the upload succeeds.

## 7. Publishing to Azure

Publishing makes the current GitHub version available as a running website in Azure.

Before publishing, confirm:

- Repository status is ready.
- Publishing setup is ready.
- Required environment variables have been added.
- The code you want is present in the managed GitHub repository.

Select **Publish to Azure** from the focused wizard. This separate button is your explicit confirmation: setup and repair never publish on their own. Publishing may take several minutes. Preparation, setup checks, repairs, and publishing pages refresh automatically, so leave the page open and do not repeat an action while it is running.

When publishing succeeds, the wizard shows **Your app is online** and **Open app details**. The full app details page is intentionally withheld until this first success. If you leave earlier, My Apps shows **Continue Setup** and resumes the exact safe step. After success, My Apps shows **Manage App**.

After publishing, open the app and test its most important task. A successful deployment only proves that Azure started the app; it does not prove every form, permission, integration, or data rule behaves correctly.

### Updating an app

1. Make and test the change with Codex or a developer.
2. Push the change to the managed GitHub repository.
3. If push-to-deploy is enabled, the GitHub workflow may publish automatically. Otherwise, return through **Manage App** and select **Publish to Azure**.
4. Test the published app again.

## 8. Environment variables and secrets

Environment variables provide settings the app needs at runtime, such as an external service address or secret credential. Add them from the app details page instead of placing secret values in the code or documentation.

The portal stores user-managed secret values in an app-specific Azure Key Vault and gives only that app access. The portal does not show the secret value again after it is saved.

Good practices:

- Use the exact variable name provided by the app or integration instructions.
- Paste only the value, without explanatory text.
- Replace a variable when its credential rotates.
- Republish or restart as directed after changing a required setting.
- Never put real secrets in GitHub files, screenshots, support tickets, or email.

## 9. Collaborators and ownership

Every app has one primary owner. Owners and administrators can invite Cedarville coworkers by email. The coworker must accept the invitation through Cedarville sign-in before becoming a collaborator.

Collaborators can view app details, request their own GitHub access, repair publishing setup, and publish changes. They cannot delete app resources or transfer ownership. An administrator can reassign the primary owner when responsibility changes.

Removing a collaborator ends portal access immediately. GitHub access is revoked on a best-effort basis when the portal knows the person's GitHub username; verify repository access separately when removing someone from sensitive work.

## 10. Recovery and publishing setup

During first setup, use **Fix publishing setup** when the wizard says a protected connection needs attention. On the full details page, the same recovery appears as **Repair Publishing Setup**. Repair refreshes portal-managed GitHub secrets, Azure connection settings, and federated credentials for that app.

Repair does not delete the repository or Azure app, and it does not start a deployment. When repair finishes, select **Publish to Azure** separately if you want to deploy code. Preparation failures use **Try preparation again** with the saved safe method; publishing failures use **Try publishing again**. If a repeated failure has no safe action, use the displayed support reference.

## 11. Delete an app carefully

Deletion is divided into separate scopes:

| Choice | What it removes |
| --- | --- |
| Portal record | Removes the app from My Apps. |
| GitHub repository | Deletes the managed source repository and its history. |
| Azure deployment | Deletes the app's Azure Web App and its app-specific database when one exists. |

Azure deletion does not remove Cedarville's shared App Service Plan or shared PostgreSQL server. If you delete only the portal record and leave GitHub or Azure unchecked, those resources remain but can no longer be managed from My Apps. Arrange manual cleanup with Cedarville IT if that happens.

Before deleting, confirm the app name, decide whether the code or data must be retained, and coordinate with collaborators. Repository and Azure deletion can be difficult or impossible to reverse.

## 12. Getting help

Start with [Troubleshooting](/help/troubleshooting), then review the [FAQ](/help/faq). If you still need help, contact Cedarville IT using the approved support channel.

Provide the app name, support reference if shown, approximate time, action you selected, exact on-screen message, and a screenshot with sensitive values hidden.

Do not provide passwords, client secrets, database connection strings, environment-variable values, private keys, or downloaded app source unless support specifically arranges a secure transfer.
