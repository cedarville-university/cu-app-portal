---
name: cedarville-app-portal-workspace
description: Use when a Cedarville employee wants to create, inspect, customize, publish, repair, or retry a template-backed app managed by the Cedarville App Portal from Codex.
---

# Cedarville App Portal Workspace

Operate portal records with the Cedarville App Portal tools. This workspace skill is not the generated app-local `cu-app-portal` skill, which governs work inside one existing managed repository.

## Create From a Template

1. Call `list_app_templates` before recommending a template. Codex may recommend a template, but must not select or infer one on the user's behalf. The user must explicitly select the template before the creation summary, approval, or `create_app` call. Ask one plain-language question at a time and only offer choices returned for that template.
2. Preserve the audience exactly: Cedarville sign-in or openly public access. For public access, explain that anyone who knows or discovers the address can use the app and obtain the user's explicit public acknowledgement. Never infer acknowledgement.
3. Summarize the selected template, app name, description, database choice, and audience. Ask for explicit approval to create.
4. After approval, apply the shared mutation replay contract below and call `create_app`.

For every mutating tool (`create_app`, `request_github_access`, `publish_app_to_azure`, `repair_publishing_setup`, and `retry_publish`), generate one UUID for each approved logical operation. If that same operation times out or returns an uncertain response, reuse the same idempotency key: replay it with the same UUID and identical input. A new key means a deliberately new operation; renew the user's intent before a consequential new operation. Publish and republish both use `publish_app_to_azure`.

**Creation never publishes.** Creation stops at the private managed GitHub repository boundary. After creation, ask whether the user wants to keep the starter unchanged, publish it later, or customize it first. Publishing always requires a separate explicit request.

Repository readiness means only that the portal-managed GitHub repository is ready. Repository readiness does not prove the actor has GitHub access, local Git or GitHub authentication works, customization was tested or committed, or changes were pushed. Report each fact separately.

## Customize Safely

Request GitHub access only after the user chooses local customization. Use `get_app` before deciding whether to call `request_github_access` with the actor's GitHub username and a stable idempotency key. Only actor-specific `repositoryAccess.status === GRANTED` is clone, fetch, and push ready. `INVITED` is partial: ask the actor to accept the invitation, then refresh with `get_app`. Do not repeat `request_github_access` merely because the invitation remains pending. `FAILED` is blocked. Do not infer access from repository readiness.

Once actor access is ready, use ordinary local Git over HTTPS. Authentication must use secure browser or operating-system sign-in. Never ask for passwords, personal access tokens, SSH private keys, portal credentials, or other secrets, and do not substitute GitHub CLI or a GitHub connector. Clone into a user-approved local Codex project, make and test changes, commit them, and push before describing customization as present in the managed repository.

## Publish and Recover

Before any publish, republish, repair, or retry, use `get_app` and follow `allowedNextActions`. Each newly approved logical operation receives its own stable UUID under the shared mutation replay contract.

- After an explicit publish or republish request, call `publish_app_to_azure`, then use `get_publish_status` for its attempt.
- If setup needs repair, explain the diagnosis and the fact that repair dispatches no deployment. Ask separately before `repair_publishing_setup`.
- If a publish failed, explain the safe failure and ask separately before `retry_publish`.
- Never automatically repair or retry. A read, diagnosis, creation approval, or publish approval is not approval for either recovery action.

Poll with bounded waits: make at most six status checks over ten minutes, and stop earlier on success, safe failure, `AUTHENTICATION_REQUIRED`, `ACTION_REQUIRED`, or another terminal result. If the attempt is still queued or running at the bound, report a partial outcome and stop. Queued, running, invited, or setup-ready is not deployed.

Report outcomes as verified, partial, or blocked. Verified means a portal tool directly confirmed repository or publish state, or local Git directly confirmed a push. Partial means work is queued, invited, still running, only local, or otherwise incomplete. Blocked means authentication, user or administrator action, a quiet not-found result, or a safe provider failure prevents progress. Include safe links and support references when returned.

After `NOT_FOUND`, say only that no accessible app was found and stop. Do not call `list_my_apps`, retry alternate IDs, or perform further discovery unless the user separately asks to list their accessible apps. Do not reveal or infer the app's existence, ownership, or access rules.

## Scope and Tools

Use `list_my_apps` and `get_app` for authorized discovery. The nine supported tools are `list_app_templates`, `list_my_apps`, `create_app`, `get_app`, `request_github_access`, `publish_app_to_azure`, `get_publish_status`, `repair_publishing_setup`, and `retry_publish`.

Route existing GitHub or local app imports, collaborator management, environment variables, push-to-deploy, and deletion to the Cedarville App Portal UI. Do not replace an import with template creation, operate the browser for the user, or solicit credentials.
