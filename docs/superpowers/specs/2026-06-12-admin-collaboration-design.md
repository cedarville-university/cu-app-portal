# Admin And App Collaboration Design

## Overview

This design adds a portal-owned admin feature to the Cedarville App Portal and expands app access from single-owner-only to owner plus collaborators.

The portal keeps one primary owner for each app request through the existing `AppRequest.userId` field. A new collaborator access model lets additional users work on the same app without changing accountability. Admin authorization is managed inside the portal database, with the first admin bootstrapped from configuration and all later admin changes managed through the admin UI.

## Goals

- Allow only portal admins to access `/admin`.
- Let admins see all users and all apps.
- Let admins add and remove the admin role for other users.
- Let admins delete apps using the existing scoped deletion behavior.
- Let admins reassign an app to a different primary owner.
- Let admins add or remove collaborators on an app.
- Let collaborators view app details, download artifacts, request GitHub repository access for themselves, repair publishing setup, and publish app changes.
- Preserve a single primary owner for each app.
- Keep destructive app deletion restricted to owners and admins.

## Non-Goals

- Managing roles through Entra app roles or Entra groups.
- Replacing the app owner with many co-owners.
- Building an owner-facing collaborator management UI in this first pass.
- Creating a full audit database. The current audit sink remains structured console events.
- Changing GitHub repository ownership, Azure resource ownership, or external provider permissions beyond existing portal actions.

## Authorization Model

### Portal Roles

The portal stores admin role membership locally. The recommended data shape is a `UserRole` table with:

- `id`
- `userId`
- `role`, initially `ADMIN`
- `createdAt`
- `updatedAt`

This is more extensible than a boolean `isAdmin` field while still remaining small.

The first admin is bootstrapped from an environment variable such as `PORTAL_INITIAL_ADMIN_EMAILS`. During sign-in user sync, if the signed-in user's email matches that list, the portal ensures the user has the `ADMIN` role. After bootstrap, admins can grant or remove admin access inside `/admin`.

The admin role is portal-owned. Entra remains the identity provider, but it is not the source of truth for admin authorization in this design.

### App Collaborators

The portal adds an `AppAccess` join table with:

- `id`
- `appRequestId`
- `userId`
- `createdAt`
- `updatedAt`

`AppRequest.userId` remains the primary owner. Owner access is implicit and does not need a row in `AppAccess`.

The effective app access rule is:

- A user can access an app if they are the owner, a collaborator, or an admin.
- A user can delete an app if they are the owner or an admin.
- A user can reassign ownership only if they are an admin.
- A user can manage collaborators only if they are an admin in this first pass.

Collaborators can:

- View app details.
- Download app artifacts.
- Request GitHub repository access for their own GitHub username.
- Retry repository bootstrap where the existing owner-facing UI allows it.
- Repair publishing setup.
- Publish or retry publishing to Azure.
- Enable push-to-deploy where the existing app state allows it.

Collaborators cannot:

- Delete portal records, GitHub repositories, or Azure deployments.
- Reassign the primary owner.
- Grant or remove the admin role.
- Manage collaborators in this first pass.

## Admin User Experience

The admin feature is available at `/admin`. Non-admin authenticated users should not see admin navigation and should receive `notFound()` if they visit the route directly.

The primary site header shows an `Admin` navigation link only to admins.

The admin page has two operational sections.

### Users Section

The users section lists all portal users with:

- Display name.
- Email.
- GitHub username, if present.
- Admin status.
- Number of apps owned.
- Number of apps where they are collaborators.

Admins can:

- Grant admin access to a non-admin user.
- Remove admin access from an admin user.

The portal must prevent removing the last admin. It should also prevent a user from accidentally removing their own admin role when they are the only admin.

### Apps Section

The apps section lists all app requests with:

- App name.
- Primary owner.
- Collaborators.
- Generation status.
- Repository status.
- Publish status.
- Repository link, when available.
- Published app link, when available.
- Created date.

Admins can:

- Open the app details page.
- Add a collaborator by selecting an existing portal user.
- Remove a collaborator.
- Reassign the app to another existing portal user.
- Delete selected app resources through the existing scoped deletion options.

When an admin reassigns an app, the old owner should be kept as a collaborator by default. This preserves handoff continuity and avoids unexpectedly removing access from the person who originally created or managed the app.

## Data Flow

### Sign-In And Bootstrap

1. A user signs in through the existing Entra flow.
2. The portal syncs the user into the local `User` table.
3. The portal checks `PORTAL_INITIAL_ADMIN_EMAILS`.
4. If the signed-in email is configured as an initial admin, the portal ensures that user has `ADMIN`.
5. The session continues using the existing user id.

Bootstrap should be idempotent. Repeated sign-ins must not create duplicate role rows.

### App Access Reads

Existing owner-only app request queries should move behind shared access helpers. The helper should express intent clearly:

- `requireAdminUser()`
- `getCurrentUserRoleContext()`
- `loadAccessibleAppRequest(requestId)`
- `loadMutableAppRequestForDeletion(requestId)`
- `canAccessApp(userId, requestId)`
- `canDeleteApp(userId, requestId)`

The exact names can follow implementation needs, but access logic should not be copied into each route or action.

The download route should keep its quiet failure behavior:

- `401` when no user can be resolved.
- `404` when the request is not accessible to the current user or has no artifact.
- Attachment response when the current user has owner, collaborator, or admin access.

### Operational App Actions

The following existing actions should allow owner, collaborator, or admin access:

- Save GitHub username and grant repository access.
- Retry repository bootstrap.
- Publish to Azure.
- Retry publish.
- Enable push-to-deploy.
- Repair publishing setup.
- Existing repository preparation and verification actions, if they currently use app owner checks.

The GitHub username save action should update the current acting user's `githubUsername`, not necessarily the primary owner's username. This matters because collaborators need to request GitHub access for themselves.

### Destructive App Actions

Deletion should continue to use the existing scoped behavior:

- Portal record deletion.
- GitHub repository deletion.
- Azure deployment deletion.

The authorization rule changes from owner-only to owner-or-admin. Collaborators cannot delete.

Admin-initiated deletion should record audit details identifying the acting admin, request id, support reference, and selected deletion targets.

### Admin Mutations

Admin server actions must call the admin guard themselves. The UI hiding controls is not sufficient.

Admin actions:

- `grantAdminRoleAction(userId)`
- `removeAdminRoleAction(userId)`
- `addAppCollaboratorAction(appRequestId, userId)`
- `removeAppCollaboratorAction(appRequestId, userId)`
- `reassignAppOwnerAction(appRequestId, newOwnerUserId)`
- `adminDeleteAppAction(appRequestId, formData)`, if a wrapper is clearer than extending the owner deletion action

Adding an existing collaborator should be idempotent. Removing a non-collaborator should not damage owner access. Reassigning to an unknown user should fail with a clear error.

## Error Handling

Admin and access-control failures should fail closed.

- Non-admin `/admin` visits return `notFound()`.
- Non-admin calls to admin actions throw an authorization error.
- Unknown users or apps produce clear server-action errors.
- Removing the last admin is blocked.
- Adding an app collaborator who is already the owner should be treated as a no-op or a clear no-op message.
- Adding a duplicate collaborator should be idempotent.
- Reassigning ownership should happen in a transaction that updates the owner and preserves the old owner as a collaborator.
- External deletion failures should keep the existing partial-completion behavior.

## Audit Events

Add structured audit events for:

- `ADMIN_ROLE_GRANTED`
- `ADMIN_ROLE_REMOVED`
- `APP_COLLABORATOR_ADDED`
- `APP_COLLABORATOR_REMOVED`
- `APP_OWNER_REASSIGNED`
- `ADMIN_APP_DELETION_REQUESTED`
- `ADMIN_APP_DELETION_SUCCEEDED`
- `ADMIN_APP_DELETION_FAILED`

The existing audit implementation logs to console. These events should include enough details to trace the action:

- Acting user id.
- Target user id when applicable.
- App request id when applicable.
- Support reference when applicable.
- Old owner id and new owner id for reassignment.
- Selected deletion targets for deletion events.

## UI Notes

The current portal UI is operational and restrained. The admin page should follow that style:

- Use dense tables or table-like rows for users and apps.
- Keep actions small and explicit.
- Avoid marketing-style hero content.
- Do not place destructive controls near routine links without confirmation.
- Use the existing `ConfirmDeleteForm` and `PendingSubmitButton` patterns where possible.

The admin feature is a work surface, not a landing page.

## Testing Strategy

The implementation should use TDD and add focused tests before production changes.

### Role And Bootstrap Tests

- Initial admin emails grant `ADMIN` on sign-in sync.
- Bootstrap is idempotent.
- Non-matching users are not admins.
- Removing the final admin is blocked.

### App Access Tests

- Owners can access their app.
- Collaborators can access an app.
- Admins can access any app.
- Unrelated users cannot access an app.
- Collaborators cannot delete an app.
- Owners and admins can delete an app.

### Route And Action Tests

- `/admin` renders for admins.
- `/admin` returns `notFound()` for non-admin users.
- The header shows `Admin` only for admins.
- The download route returns artifacts for collaborators and admins.
- The download route keeps returning quiet `404` for unrelated users.
- Collaborators can save their own GitHub username and request repository access.
- Collaborators can publish, retry publish, repair setup, and enable push-to-deploy when app state allows.
- Admin actions grant/remove roles, add/remove collaborators, reassign owner, and delete apps.

### Regression Checks

- Existing owner flows still work.
- Existing quiet download authorization remains intact.
- `npm test` passes.
- `npm run build` passes.

## Documentation Updates

Update local setup docs to include:

- `PORTAL_INITIAL_ADMIN_EMAILS`
- How initial admin bootstrap works.
- That later admin role management happens inside `/admin`.
- The collaborator permission model.

Update README feature description to mention:

- Admin management.
- App collaborators.
- Single primary app owner.

## Open Decisions Resolved

- Admin roles are managed entirely inside the portal.
- The initial admin is bootstrapped from configuration.
- Apps keep a single primary owner.
- Collaborators can set up GitHub access and publish changes.
- Collaborators cannot delete apps.
- Admins can reassign owners, manage collaborators, delete apps, and manage admin role membership.
