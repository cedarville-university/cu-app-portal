---
title: Troubleshooting
description: Plain-language solutions to common portal and publishing problems.
lastReviewed: 2026-08-18
owner: Cedarville IT
---

# Troubleshooting

Start with the row that most closely matches what you see. Read the full on-screen message before retrying. Avoid repeatedly selecting an action while it is still running.

| What you see | What it usually means | What to do |
| --- | --- | --- |
| You cannot sign in | The Cedarville session, account, or portal authentication configuration needs attention. | Close other Microsoft sign-in prompts, use your Cedarville account, and try again. If it continues, contact support. |
| An app creation form will not submit | A required field is empty or has an unsupported value. | Read the message beside each field, correct it, and submit again. |
| The code home is still being prepared | The portal is creating or checking the managed repository. | Leave the page open. It checks automatically and moves to the next safe step. |
| Repository setup failed | GitHub could not create or import the managed repository. | Follow the offered restart or retry once. Confirm the repository address is correct and accessible. Then provide the displayed support reference to support. |
| A GitHub invitation is pending | GitHub access was requested but has not been accepted. | Sign in to the correct GitHub account, check notifications and email, and accept the repository invitation. |
| The portal does not know your GitHub username | Your portal profile is missing the account name used on GitHub. | Open Settings, enter the username only, save it, and return to the app. |
| **My code has been uploaded** is shown | The portal is waiting for Codex to finish the local upload. | Do not select it early. Wait for Codex to report a successful push, then select it so the portal can inspect the uploaded code. |
| The local app cannot be prepared | The uploaded runtime is not supported yet. | Copy the repair prompt into Codex. After Codex repairs, tests, and pushes it, select **I've repaired and uploaded my code**. |
| Preparation needs another try | The portal could not finish the saved preparation method. | Select **Try preparation again** once. The portal reuses the same safe direct-update or review method. |
| A safe GitHub review is offered | Existing publishing files overlap with the portal's proposed files. | Select **Open a safe review on GitHub**, review and merge the pull request, then select **I've approved the changes**. Ask a developer if you do not recognize the files. |
| Publishing setup needs attention | A managed credential or required setting is stale or missing. | Select **Fix publishing setup** in onboarding or **Repair Publishing Setup** in full details. When setup is ready, select **Publish to Azure** separately. |
| Publish failed | GitHub Actions, Azure, the app build, or a required setting failed. | Open the failure details if available. Select **Try publishing again** once. If offered after a repeated problem, fix publishing setup before another try. |
| Published app shows an error page | Azure started a deployment, but the app may have a code, startup, database, or configuration error. | Confirm required environment variables, then republish. Record the time and error text for support. |
| Your latest change is missing | The change may not have been pushed to the managed repository or republished. | Confirm the commit is on GitHub, publish again if needed, then refresh the app without using the browser cache. |
| A collaborator cannot open the app in the portal | The invitation may not be accepted or the wrong Cedarville address was used. | Ask the person to use the invitation link and Cedarville sign-in. Remove and resend the invitation if the address is wrong. |
| A collaborator cannot open GitHub | Portal collaboration does not automatically guarantee GitHub access. | Have the collaborator save their GitHub username and request repository access from the app page. |
| An environment variable did not fix the app | The name may be wrong, the value may need rotation, or the app may need another publish. | Verify the exact name, replace the value, and follow the app's instructions to republish. Never send the value to support. |
| A delete option is unavailable | Your role or the current resource state does not allow that deletion. | Confirm you are the primary owner or ask a portal administrator for help. |

## Safe retry sequence

1. Wait for the current action to finish or clearly fail.
2. Read and save the exact message and support reference.
3. Refresh the page once.
4. Use **Fix publishing setup** or **Repair Publishing Setup** only when the setup status calls for it.
5. Retry the failed action once.

If the same problem repeats, stop and contact support.

## What to send support

- App name and support reference.
- The approximate date and time.
- The page and button you used.
- Exact message or a screenshot with sensitive information hidden.
- Whether the issue happened once or repeated after one retry.

Never send secret values, passwords, private keys, database connection strings, or the contents of environment variables.
