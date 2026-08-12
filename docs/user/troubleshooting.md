---
title: Troubleshooting
description: Plain-language solutions to common portal and publishing problems.
lastReviewed: 2026-08-03
owner: Cedarville IT
---

# Troubleshooting

Start with the row that most closely matches what you see. Read the full on-screen message before retrying. Avoid repeatedly selecting an action while it is still running.

| What you see | What it usually means | What to do |
| --- | --- | --- |
| You cannot sign in | The Cedarville session, account, or portal authentication configuration needs attention. | Close other Microsoft sign-in prompts, use your Cedarville account, and try again. If it continues, contact support. |
| An app creation form will not submit | A required field is empty or has an unsupported value. | Read the message beside each field, correct it, and submit again. |
| Repository setup failed | GitHub could not create, import, or prepare the managed repository. | Retry once. Confirm the repository address is correct and accessible. Then provide the displayed support reference to support. |
| A GitHub invitation is pending | GitHub access was requested but has not been accepted. | Sign in to the correct GitHub account, check notifications and email, and accept the repository invitation. |
| The portal does not know your GitHub username | Your portal profile is missing the account name used on GitHub. | Open Settings, enter the username only, save it, and return to the app. |
| Publishing setup says Needs Repair | A managed credential or required setting is stale or missing. | Select Repair Publishing Setup. When setup returns to Ready, select Publish separately. |
| Apply Publishing Setup is offered | An imported repository still needs the portal's publishing files. | Apply the setup. If the portal reports conflicts, use Review Publishing Changes instead. |
| Review Publishing Changes is offered | Existing repository files overlap with portal publishing files. | Open the GitHub review page, review and approve the changes, then return to the portal. Ask a developer for help if you do not recognize the files. |
| Publish failed | GitHub Actions, Azure, the app build, or a required setting failed. | Open the failure details if available. Fix the named issue, retry once, and contact support if it repeats. |
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
4. Use Repair Publishing Setup only when the setup status calls for it.
5. Retry the failed action once.
6. If the same problem repeats, stop and contact support.

## What to send support

- App name and support reference.
- The approximate date and time.
- The page and button you used.
- Exact message or a screenshot with sensitive information hidden.
- Whether the issue happened once or repeated after one retry.

Never send secret values, passwords, private keys, database connection strings, or the contents of environment variables.
