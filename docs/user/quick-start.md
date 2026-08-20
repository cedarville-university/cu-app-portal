---
title: Quick Start
description: Start, customize, and publish your first Cedarville app.
lastReviewed: 2026-08-20
owner: Cedarville IT
---

# Quick Start

Use this page when you are creating a Cedarville app for the first time. You do not need to know how to program, use GitHub, or configure Azure before you begin.

## Start in the right place

- **Create New App:** Start from an approved template. The next page explains that you will choose a template.
- **Add Existing App:** Choose **Already on GitHub** if the app is saved on GitHub, or **Only on my computer** if its files have not been uploaded there.

GitHub is a secure website that stores app files and their change history. Azure is Microsoft's service for running the published app. You do not need to know Git, GitHub, or Azure commands.

## Before using Codex

Git keeps change history in the app folder on your computer. GitHub keeps Cedarville's managed online copy.

1. Install Git from **Company Portal** on Windows or **CedarNet 2.0** on macOS. After installation, completely quit and reopen Codex.
2. In Codex, create a **local Codex project**. For a new starter, use a new empty folder named for the app. For an app already on your computer, use the folder that already contains it. Make that folder primary.
3. Start the task inside that project. Do not use Quick chat or a standalone task outside the project.
4. Paste the portal's prompt. Codex checks Git and handles the commands. For a local app, it first pulls the portal guidance, checks whether the app can be hosted, and safely migrates it only when needed. Complete a secure browser sign-in if GitHub opens one; never give Codex a password, token, or SSH key.

## Create a starter

1. Select **Create New App**, then **Choose an app template**.
2. Choose a recommended template. Each template explains what it is best for. If you are unsure, use the option whose examples are closest to your project.
3. Enter the app name and description. Choose database or Cedarville login options only when the form offers them and your app needs them.
4. Select **Create App**. This creates the starter and its private online code home; it does not publish.
5. **Publish the starter now** starts Azure publishing immediately. It is the only publish confirmation for an unchanged starter. Or select **Customize it with Codex first**. Codex is an AI coding assistant. Follow the page's GitHub account, invitation, and local-project steps. Return after Codex says the changes were pushed. The customized path later asks you to select **Publish to Azure** after setup is ready.
6. Leave the progress page open. It updates automatically during preparation, publishing setup, and publishing. Do not click an action again while it is running.
7. When **Your app is online** appears, select **Open app details** and test the app's main task.

## Return later

Open **My Apps**. An app that has not finished its first publish shows **Continue Setup** and returns to the exact safe step. A successfully published app shows **Manage App** and opens full details for later publishing, coworkers, settings, repair, or deletion.

## If something needs attention

Read the full message. If offered, use **Try preparation again** or **Fix publishing setup**; fixing setup does not publish. Existing publishing files may require **Open a safe review on GitHub**. See [Troubleshooting](/help/troubleshooting) for the local upload and recovery paths.

Never send passwords, secret values, or the contents of environment variables when asking for help. Provide the app name, support reference if shown, the approximate time, and a screenshot of the message.
