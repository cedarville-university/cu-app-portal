# Owner Remove Collaborators Design

## Overview

This design lets app owners and portal admins remove accepted collaborators from
the app details screen (`/download/[requestId]`).

Today:

- Owners and admins can **invite** collaborators and revoke **pending** invites
  on app details.
- Admins can **remove accepted collaborators** only from Admin → Apps.
- The admin remove path deletes portal `AppAccess` only; it does not revoke
  GitHub repository collaborator access.
- The App Access card on app details lists owner and collaborators as read-only.

This feature closes the owner gap and aligns remove behavior with a shared
service that also best-effort revokes GitHub access when possible.

## Goals

- Let app owners remove accepted collaborators without using the admin UI.
- Let portal admins remove collaborators from the same app details controls
  (admins retain the existing admin page controls).
- Reuse one remove implementation for owner/admin and admin-page paths.
- Best-effort revoke GitHub repository collaborator access when a managed repo
  is ready and the target user has a GitHub username on file.
- Always complete portal removal even when GitHub revoke is skipped or fails.
- Preserve existing audit (`APP_COLLABORATOR_REMOVED`) and notification
  (`COLLABORATOR_REMOVED`) behavior.
- Fail closed for unauthorized actors.

## Non-Goals

- Collaborator self-leave (“leave this app”).
- Changing pending invite revoke/resend (already on the invite panel).
- Blocking portal removal when GitHub revoke fails.
- Automatic GitHub access grant on invite accept (unchanged).
- Owner reassignment or demoting the primary owner via this action.
- Strong post-action flash/banner UX (keep quiet revalidate, same as admin
  remove today).
- New database tables or schema changes.

## Product Decisions

### Authorization

A user may remove a collaborator when they are:

- the app’s primary owner (`AppRequest.userId`), or
- a portal admin.

Collaborators cannot remove other collaborators. Server actions re-check
authorization; UI visibility is not sufficient.

### Remove semantics

Removing a collaborator means:

1. Delete the `AppAccess` row for `(appRequestId, targetUserId)` (idempotent if
   already absent).
2. Never change `AppRequest.userId` via this action.
3. Reject attempts to “remove” the primary owner (they are not a collaborator).
4. Best-effort GitHub collaborator revoke when:
   - the app has a managed repository with status `READY` and owner/name set, and
   - the target user has a non-empty `githubUsername`.
5. Record audit event `APP_COLLABORATOR_REMOVED` with actor, app, support
   reference, target user, and GitHub outcome details when attempted.
6. Send notification event `COLLABORATOR_REMOVED` with the removed user as a
   direct recipient (existing notification service behavior).
7. Revalidate app details, apps list, and admin views as appropriate.

### GitHub failure policy

Portal access removal always proceeds.

| Situation | GitHub call | Portal result |
| --- | --- | --- |
| No repo / not READY | Skip | Remove AppAccess |
| No `githubUsername` on target | Skip | Remove AppAccess |
| DELETE returns 204 or 404 | Success (gone / never invited) | Remove AppAccess |
| GitHub API / network error | Log + audit failed outcome | Remove AppAccess |

UI feedback stays quiet (revalidate only), matching today’s admin remove
control. Operators can use audit logs if GitHub revoke failed.

### UI placement

On `/download/[requestId]`, extend the **App Access** card:

- Collaborator rows still show display name and email.
- When the viewer is owner or admin, each collaborator row includes a
  **Remove** control (`PendingSubmitButton`, danger/ghost, small, with
  accessible label).
- Collaborators (non-owner, non-admin) continue to see a read-only list.
- Invite Collaborators panel remains separate for pending invites.

Admin → Apps detail page keeps its existing Remove collaborator forms; they
call the same shared service (and therefore gain best-effort GitHub revoke).

## Architecture

### Shared service

Introduce a shared remove helper (exact path chosen during implementation;
preferred near collaboration concerns, e.g.
`src/features/collaboration-invites/remove-collaborator.ts` or a small shared
module used by both admin and invites):

```text
removeAppCollaborator({ appRequestId, targetUserId, actorUserId })
  → load app (must exist)
  → reject if targetUserId === app.userId
  → deleteMany AppAccess for app + target
  → best-effort revokeManagedRepositoryAccess when READY + username
  → audit APP_COLLABORATOR_REMOVED (+ github outcome fields)
  → safeNotifyAppEvent COLLABORATOR_REMOVED → target
  → return { removed, github: "revoked" | "skipped" | "failed", ... }
```

Authorization is **not** fully owned by the service alone: callers must ensure
the actor is allowed (owner/admin for app details, admin-only for pure admin
actions if still gated that way). The shared service may optionally assert that
`actorUserId` is owner or admin for defense in depth; at minimum, both public
actions must authorize before calling.

### Actions

1. **App details action** (new or co-located with collaboration invite actions)

   - Bound as `removeAppCollaboratorAction(appRequestId, targetUserId)`.
   - Resolve current user; require owner of that app or portal admin.
   - Call shared service.
   - Revalidate `/download/[appRequestId]`, `/apps`, and admin paths as needed.

2. **Admin action** (`src/features/admin/actions.ts` `removeAppCollaboratorAction`)

   - Keep `requireAdminUserId()`.
   - Replace inline delete/notify/audit with the shared service call.
   - Preserve existing revalidation behavior for admin views.

### GitHub client

Extend the managed GitHub installation client:

- Add `removeRepositoryCollaborator({ owner, name, username })` using
  `DELETE /repos/{owner}/{repo}/collaborators/{username}`.
- Treat HTTP 204 and 404 as success.
- Export `revokeManagedRepositoryAccess` (mirror of
  `grantManagedRepositoryAccess`) for use by the shared remove service.

### App details data

The page query already loads collaborators for App Access. Ensure each
collaborator payload includes `user.id` (not only displayName/email) so Remove
forms can bind `targetUserId`.

### Component shape

Prefer extending `renderAppAccessSummary` (or extracting a small presentational
component) with:

- `canManageCollaborators: boolean`
- `appRequestId: string`
- collaborator `user.id`
- form action bound per collaborator

## Error Handling

| Case | Behavior |
| --- | --- |
| Unauthenticated | Fail closed (existing session / current-user resolution) |
| Not owner and not admin | Fail closed with clear error |
| App not found / not accessible | Fail closed |
| Target is the primary owner | Fail closed; do not delete ownership |
| Target not a collaborator | Idempotent success (see below) |
| GitHub errors | Do not throw to the user after portal remove succeeds; log and record audit detail |

**Idempotency (explicit):**

- If an `AppAccess` row was deleted: write `APP_COLLABORATOR_REMOVED` audit and
  send `COLLABORATOR_REMOVED` notification.
- If no `AppAccess` row existed: succeed without notification noise. Optionally
  still write a short audit note that a no-op remove was requested; do not email.
- Best-effort GitHub revoke may still run when username/repo conditions are met
  (covers “portal row already gone but GitHub access remained”).

## Testing

### Shared service unit tests

- Owner actor removes collaborator: AppAccess deleted, notify + audit fired.
- Admin actor removes collaborator: same.
- Target is owner: throws / fails closed; no AppAccess delete of others.
- No AppAccess row: no notify; action succeeds.
- GitHub skipped when repo not READY or username missing.
- GitHub 204/404 treated as revoked success.
- GitHub API failure: AppAccess still deleted; audit records failure; action
  does not throw after portal remove.

### Action tests

- App details action: non-owner collaborator rejected; owner allowed; admin
  allowed.
- Admin action: still requires admin; uses shared service (spy/mock).

### UI / page tests

- Owner sees Remove controls on collaborator rows.
- Admin viewer sees Remove controls.
- Collaborator viewer does not see Remove controls.
- Invite panel visibility unchanged.

### GitHub client tests

- DELETE collaborator path and success statuses (204, 404).

## Implementation Notes

- Follow existing invite-panel patterns for `PendingSubmitButton` and bound
  server actions.
- Do not weaken download/access predicates; removed users lose app access on
  next load via missing `AppAccess`.
- Keep GitHub username as the target user’s own profile field (same as grant).
- No Prisma schema migration required.

## Success Criteria

- Owner on app details can remove an accepted collaborator and that user loses
  portal app access.
- Admin on app details (and admin page) can remove with the same backend path.
- When conditions allow, GitHub collaborator membership is revoked best-effort.
- Unauthorized users cannot remove collaborators.
- Existing invite, download, and admin collaborator flows remain intact.
- Targeted unit/page tests pass; project test suite remains green for touched
  areas.
