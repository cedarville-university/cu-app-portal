---
title: User Guide
description: Detailed instructions for creating, managing, and publishing apps with the Cedarville App Portal.
lastReviewed: 2026-08-03
owner: Cedarville IT
---

# Cedarville App Portal User Guide

This guide explains the complete app lifecycle in plain language. Start with the [Quick Start](/help/quick-start) if you only need the shortest path to a first published app.

## 1. What the portal does

The Cedarville App Portal brings the main pieces of an app into one managed workflow. It can create starter code from an approved template, keep that code in a managed GitHub repository, prepare Azure hosting, publish the app, and help you manage access afterward.

The portal does not design every screen or write every business rule for you. After creating the starter, you can work with Codex or a developer to customize the app. GitHub remains the supported source of truth: the version stored there is the version Cedarville tools review and publish.

## 2. Understand the app lifecycle

1. **Create or add:** Start from a portal template, add a repository that already exists, or create an empty repository for an app still on your computer.
2. **Customize:** Use Codex or a developer to change the managed GitHub repository.
3. **Prepare:** The portal adds and checks the settings needed for GitHub and Azure to work together.
4. **Publish:** The portal starts the GitHub workflow that sends the current app to Azure.
5. **Manage:** Use My Apps to check status, change settings, invite collaborators, repair setup, or remove resources.

## 3. Choose the right starting point

### Create a new app from a template

Choose **Create App** when you are starting a new project and want Cedarville-approved defaults. Recommended Templates are written for common, non-technical use cases. Developer Starters expose lower-level choices and are better when a developer already knows the intended architecture.

Common template capabilities include:

- A PostgreSQL database for information the app must save.
- Microsoft Entra login when only authorized Cedarville users should enter the app.
- A web interface for forms, trackers, and information pages.
- An API or automation service for a system-to-system process without a normal web page.

Selecting a database or login adds infrastructure and configuration. Choose it because the app needs it, not because it sounds useful.

### Add an existing app

Choose **Add Existing App** when code already exists.

- **Already on GitHub:** Give the portal the repository address. If necessary, the portal imports it into Cedarville's managed GitHub organization while preserving its history. The portal checks whether it matches a supported Azure App Service runtime.
- **Not on GitHub yet:** Let the portal create an empty managed repository. The app details page provides instructions that Codex or a developer can use to connect the local folder and push the code.

Imported apps currently support root Next.js, Express, Python FastAPI, and plain static Python apps. A repository with conflicting publishing files may require a GitHub review page before the portal applies its setup.

## 4. Create an app from a template

1. Open **Create App**.
2. Read the template summaries and select the closest match.
3. Enter a short, recognizable app name. Avoid department abbreviations that coworkers may not understand.
4. Describe the app's purpose and intended users.
5. Review optional database and login choices.
6. Choose **Create Only** if you want to customize before hosting, or **Create and Publish** if the starter is ready for an initial deployment.
7. Keep the result page open until repository and publishing setup statuses settle.

The portal creates the managed GitHub repository directly. Make ongoing changes there so the portal, Codex, reviewers, and Azure all use the same source.

## 5. GitHub access and code changes

GitHub is the managed online location for the app's code. It records changes and lets Cedarville's publishing workflow use a reviewed source.

To request access:

1. Open **Settings** and save your GitHub username.
2. Return to the app from **My Apps**.
3. Use the repository access action if access has not already been granted.
4. Accept any GitHub invitation sent to your account.

Portal collaboration and GitHub access are related but separate. A portal collaborator can see and operate the app in the portal, but may still need to request GitHub repository access.

When Codex or a developer changes the app, confirm the finished work is committed and pushed to the portal-managed repository. Local files that were never pushed cannot be published by the portal.

## 6. Publishing to Azure

Publishing makes the current GitHub version available as a running website in Azure.

Before publishing, confirm:

- Repository status is ready.
- Publishing setup is ready.
- Required environment variables have been added.
- The code you want is present in the managed GitHub repository.

Select **Publish** from the app details page. Publishing may take several minutes. You can leave the page and return through My Apps. A successful run shows **Published** and a Published app link.

After publishing, open the app and test its most important task. A successful deployment only proves that Azure started the app; it does not prove every form, permission, integration, or data rule behaves correctly.

### Updating an app

1. Make and test the change with Codex or a developer.
2. Push the change to the managed GitHub repository.
3. If push-to-deploy is enabled, the GitHub workflow may publish automatically. Otherwise, return to the portal and select **Publish**.
4. Test the published app again.

## 7. Environment variables and secrets

Environment variables provide settings the app needs at runtime, such as an external service address or secret credential. Add them from the app details page instead of placing secret values in the code or documentation.

The portal stores user-managed secret values in an app-specific Azure Key Vault and gives only that app access. The portal does not show the secret value again after it is saved.

Good practices:

- Use the exact variable name provided by the app or integration instructions.
- Paste only the value, without explanatory text.
- Replace a variable when its credential rotates.
- Republish or restart as directed after changing a required setting.
- Never put real secrets in GitHub files, screenshots, support tickets, or email.

## 8. Collaborators and ownership

Every app has one primary owner. Owners and administrators can invite Cedarville coworkers by email. The coworker must accept the invitation through Cedarville sign-in before becoming a collaborator.

Collaborators can view app details, request their own GitHub access, repair publishing setup, and publish changes. They cannot delete app resources or transfer ownership. An administrator can reassign the primary owner when responsibility changes.

Removing a collaborator ends portal access immediately. GitHub access is revoked on a best-effort basis when the portal knows the person's GitHub username; verify repository access separately when removing someone from sensitive work.

## 9. Repair Publishing Setup

Use **Repair Publishing Setup** when the portal says managed publishing credentials or settings are missing, stale, or out of date. Repair refreshes portal-managed GitHub secrets, Azure connection settings, and federated credentials for that app.

Repair does not delete the repository or Azure app, and it does not start a deployment. When repair finishes, select Publish separately if you want to deploy code.

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

Provide:

- App name.
- Support reference, if shown.
- Approximate time and the action you selected.
- Exact on-screen message.
- A screenshot with sensitive values hidden.

Do not provide passwords, client secrets, database connection strings, environment-variable values, private keys, or downloaded app source unless support specifically arranges a secure transfer.
