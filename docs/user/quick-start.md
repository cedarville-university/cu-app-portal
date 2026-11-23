---
title: Quick Start
description: Start, customize, and publish your first CU Launch app.
lastReviewed: 2026-09-02
owner: Cedarville IT
---

# Quick Start

Use this page when you are launching a CU Launch app for the first time. You do not need to know how to program, use GitHub, or configure Azure before you begin.

## Start in the right place

Select [**Launch Your App**](/onboarding) from Home or My Apps, then choose where your app is today.

- **I need a new app** opens the Cedarville-approved templates.
- **My app is already on GitHub** opens a form for the repository address.
- **My app is only on my computer** sets up a private online home and guides you through adding your files with Codex.

GitHub is a secure website that stores app files and their change history. Azure is Microsoft's service for running the published app. You do not need to know Git, GitHub, or Azure commands.

## Before using Codex

Git keeps change history in the app folder on your computer. GitHub keeps Cedarville's managed online copy.

1. On Windows, install Git from **Company Portal**. On macOS, Git should be installed automatically by Cedarville login scripts; if Git is unavailable, contact Cedarville IT for help. After installation, completely quit and reopen Codex.
2. In Codex, create a **local Codex project**. For a new starter, use a new empty folder named for the app. For an app already on your computer, use the folder that already contains it. Make that folder primary.
3. Start the task inside that project. Do not use Quick chat or a standalone task outside the project.
4. Paste the portal's prompt. Codex checks Git and handles the commands. For a local app, it first pulls the portal guidance, checks whether the app can be hosted, and safely migrates it only when needed. Complete a secure browser sign-in if GitHub opens one; never give Codex a password, token, or SSH key.

## Launch a starter

1. Select **Launch Your App**, then **I need a new app**.
2. Under **Recommended Templates**, select **Launch App** on the template that best matches your project.
3. Enter the app name and description. Choose whether Cedarville sign-in is required or the app is openly public. An openly public app can be used by anyone who knows or discovers its address, so read and confirm the warning before choosing it. Choose a database only when your app needs it.
4. Select **Launch App**. This creates the starter and its private online code home; it does not publish.
5. **Publish the starter now** starts Azure publishing immediately. It is the only publish confirmation for an unchanged starter. Or select **Customize it with Codex first**. Codex is an AI coding assistant. Follow the page's GitHub account, invitation, and local-project steps. Return after Codex says the changes were pushed. The customized path later asks you to select **Publish to Azure** after setup is ready.
6. Leave the progress page open. It updates automatically during preparation, publishing setup, and publishing. Do not click an action again while it is running.
7. When **Your app is online** appears, select **Open your app** and test the app's main task. Use **Open app details** afterward to manage the app. Choose a section on the left or open **Sections** on a phone.

## Return later

Open **My Apps**. Use **Continue Setup** to resume an app's first publish. **Open app** opens the live site. To manage an app, select its name or choose **App details** from the more options menu.

## If something needs attention

Read the full message. If offered, use **Try preparation again** or **Fix publishing setup**; fixing setup does not publish. Existing publishing files may require **Open a safe review on GitHub**. See [Troubleshooting](/help/troubleshooting) for the local upload and recovery paths.

Never send passwords, secret values, or the contents of environment variables when asking for help. Provide the app name, support reference if shown, the approximate time, and a screenshot of the message.

## Publishing later changes

Push-to-deploy is enabled by default for new apps. After first publish, pushes to the managed GitHub repository's default branch publish automatically. In **App details**, open **Deployment** and select **Disable Auto-Deploy** to publish manually with **Publish to Azure**. **Enable Auto-Deploy** turns automatic publishing back on. Existing apps keep their saved setting.
