---
title: Frequently Asked Questions
description: Answers to common questions about apps, GitHub, Azure, access, and publishing.
lastReviewed: 2026-08-18
owner: Cedarville IT
---

# Frequently Asked Questions

## Do I need to know how to program?

No. Recommended Templates and the portal workflow are designed for first-time users. You may still work with Codex or a developer to customize behavior beyond the starter.

## What is GitHub, and why does the portal use it?

GitHub is a managed online place for app code and change history. It gives Codex, reviewers, collaborators, and Azure publishing one supported source for the app.

## What is Azure?

Azure is Microsoft's cloud platform. The portal uses Azure App Service to run each published web app. Apps may also receive an app-specific database and secure secret storage when required.

## Which template should I choose?

Choose the Recommended Template whose examples most closely resemble your project. Use a Developer Starter only when a developer has identified the needed runtime or service type.

## Can I change templates later?

Not as a simple switch. A template shapes the starter code and available features. Ask Codex or a developer whether adapting the current app or creating a new one is safer.

## Does publishing make my app public?

Not necessarily. Publishing makes the app run in Azure. Who can enter depends on the app's Microsoft Entra login and authorization rules. Confirm the intended audience before sharing its URL.

## Does creating a starter publish it?

No. **Create App** makes the starter and its managed repository, then stops. Choose **Publish the starter now** for the shortest route or **Customize it with Codex first**. The app goes online only after you explicitly select **Publish to Azure**.

## Do I need a GitHub account?

Not to publish an unchanged generated starter. You need one when Codex or a person must access the private repository. The wizard can open GitHub account creation, save your username, send the repository invitation, and confirm access.

## What is the difference between Continue Setup and Manage App?

**Continue Setup** returns an unpublished app to its focused first-publish wizard. **Manage App** appears after a successful first publish and opens the full app details page.

## What happens after someone changes the code?

The change must be committed and pushed to the portal-managed GitHub repository. Then push-to-deploy may publish automatically, or an authorized portal user can select Publish.

## Can another person help manage my app?

Yes. The owner or an administrator can invite a Cedarville coworker as a collaborator. The collaborator accepts through Cedarville sign-in and requests separate GitHub access when needed.

## What does Repair Publishing Setup do?

It refreshes portal-managed GitHub and Azure publishing credentials and settings. It does not delete resources, change your app's code, or start a deployment.

## Where should passwords and API keys go?

Use the app's Environment Variables area when instructed. Do not place real values in code, GitHub files, documentation, screenshots, chat messages, or email.

## Can I delete the portal record but keep the live app?

Yes, because deletion scopes are separate. However, if you remove the portal record and keep GitHub or Azure, those resources will no longer appear in My Apps and may require manual IT assistance later.

## Can deletion be undone?

Do not assume it can. Deleting a GitHub repository or Azure deployment may permanently remove code, history, configuration, or data. Coordinate and preserve anything required before deleting.

## What should I include in a support request?

Include the app name, support reference, approximate time, action selected, and exact on-screen message. Never include passwords, secret values, private keys, or environment-variable contents.
