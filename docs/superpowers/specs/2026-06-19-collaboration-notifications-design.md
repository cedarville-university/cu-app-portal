# Collaboration Notifications Design

## Overview

This design adds three related capabilities to the Cedarville App Portal:

- Email notifications for app activity.
- User notification preferences.
- Owner/admin email invitations for app collaborators.

The portal already supports app ownership, admin-managed collaborators, app
details, repository access requests, publishing setup repair, Azure publishing,
and scoped deletion. This design builds on that model by giving owners and
admins a direct way to invite coworkers, then using email notifications to keep
owners and accepted collaborators informed about important app events.

The feature is intentionally implemented as one cohesive collaboration and
notification layer rather than scattered one-off emails. App actions emit typed
notification events. A notification service resolves recipients, applies
preferences, sends immediate SMTP email, and records safe delivery evidence for
troubleshooting.

## Goals

- Notify users immediately about important events for apps they own or apps
  shared with them.
- Let users turn off email notifications globally or by category.
- Keep collaboration invite emails always deliverable as access/account mail.
- Let owners and admins invite coworkers to collaborate by entering an email
  address.
- Validate invitees against Entra before sending an invite to prevent typos and
  external sharing.
- Support coworkers who have not previously signed into the portal.
- Require invited coworkers to accept before receiving portal app access.
- Keep GitHub repository access separate from portal app access.
- Store notification delivery metadata without storing full email bodies or
  secrets.

## Non-Goals

- Building digest emails or batched notifications.
- Adding a background notification queue in the first pass.
- Sending mail through Microsoft Graph in v1.
- Letting collaborators invite additional collaborators.
- Granting GitHub repository access automatically when an invite is accepted.
- Supporting external guest users.
- Building a full audit database to replace the existing audit log sink.

## Product Decisions

### Notification Events

Emails are sent immediately for these event families.

Collaboration:

- Collaboration invite sent.
- Collaboration invite accepted.
- Collaboration invite revoked.
- App shared with a user.
- Collaborator removed.

App lifecycle:

- App created.
- Existing app imported.
- Repository setup succeeded.
- Repository setup failed.
- App deleted.

Publishing:

- Publishing setup needs repair or is blocked.
- Publish succeeded.
- Publish failed.
- Owner reassigned.

The primary recipients for normal activity emails are the app's primary owner
and accepted collaborators. The actor who caused an event should be excluded
when that avoids noisy self-notifications. Admins do not receive all app
notifications merely because they are admins. Admins receive notifications only
when they are the actor or a direct target of a collaboration or admin action.

### Notification Preferences

Email notifications default to on for every user.

Users can manage notification preferences from a real account/settings page.
The settings page should be designed as a broader future settings surface, with
notification preferences as the first section.

Preferences include:

- A global email notifications switch.
- Category toggles for:
  - Collaboration.
  - App lifecycle.
  - Publishing.

Notification emails should include a link to the settings page.

Collaboration invite emails bypass notification preferences because they are
access/account mail. A user who disables app activity notifications can still
receive an invite to collaborate on an app.

### Collaboration Invites

Owners and admins can invite collaborators from the app details page by entering
a coworker's email address. Existing collaborators can work on an app, but they
cannot invite more collaborators in this design.

The portal must verify the invitee before sending an invite:

- The email must resolve in Entra.
- The resolved user must be a member account, not a guest.
- The user must have a Cedarville email or alias.
- Aliases are valid when Entra says the invited address belongs to the user.

If Entra lookup is unavailable or not configured with sufficient permissions,
the portal must not send a blind invite. It should show a clear directory lookup
error so an operator can fix configuration or permissions.

Invites expire after 14 days. Owners and admins can see pending invites on the
app details page and can resend or revoke them.

Invite emails are sent from the portal SMTP sender but identify the inviter in
the message content.

Accepting an invite grants only portal app access by creating or confirming the
`AppAccess` collaborator row. GitHub repository access remains a separate
explicit action from the app details page.

## Data Model

### CollaborationInvite

Add a `CollaborationInvite` model to represent pending, accepted, revoked, and
expired invites without requiring the invitee to already exist as a local
portal user.

Fields:

- `id`
- `appRequestId`
- `invitedEmail`
- `normalizedInvitedEmail`
- `invitedEntraOid`
- `invitedDisplayName`
- `invitedUserId`
- `inviterUserId`
- `status`
- `tokenHash`
- `expiresAt`
- `acceptedAt`
- `revokedAt`
- `lastSentAt`
- `createdAt`
- `updatedAt`

Status enum:

- `PENDING`
- `ACCEPTED`
- `REVOKED`
- `EXPIRED`

Constraints:

- Only one active pending invite for the same app and normalized invited email.
- Index by `appRequestId`.
- Index by `normalizedInvitedEmail`.
- Index by `tokenHash`.

The accept token must be random, single-purpose, and stored only as a hash.
Token-bearing URLs must not be stored in logs or delivery metadata.

### NotificationPreference

Add a notification preference model keyed by user.

Fields:

- `id`
- `userId`
- `emailNotificationsEnabled`
- `collaborationEmailsEnabled`
- `appLifecycleEmailsEnabled`
- `publishingEmailsEnabled`
- `createdAt`
- `updatedAt`

Defaults:

- `emailNotificationsEnabled = true`
- `collaborationEmailsEnabled = true`
- `appLifecycleEmailsEnabled = true`
- `publishingEmailsEnabled = true`

The service should treat missing preference rows as default-on to avoid forcing
backfill before notifications work.

### NotificationDelivery

Add a delivery log for safe troubleshooting metadata.

Fields:

- `id`
- `appRequestId`
- `recipientUserId`
- `recipientEmail`
- `eventKey`
- `category`
- `status`
- `provider`
- `providerMessageId`
- `errorSummary`
- `sentAt`
- `createdAt`
- `updatedAt`

Status enum:

- `PENDING`
- `SENT`
- `FAILED`
- `SKIPPED`

Delivery records must not store full email bodies, raw invite tokens, SMTP
credentials, access tokens, connection strings, or provider request payloads.

## Services

### Notification Event Service

App actions should not compose SMTP messages directly. Instead, they should call
a small notification service with typed event inputs.

The service should:

1. Accept a typed event key and safe metadata.
2. Resolve the app, owner, collaborators, actor, and direct targets.
3. Determine the event category.
4. Apply user preferences unless the event is an always-send access email.
5. Render a concise email subject and body.
6. Send the email immediately through the configured mail provider.
7. Record a `NotificationDelivery` row for each recipient.

Notification failure must not roll back the app action for normal activity
events. The state change should succeed, the failure should be logged in
`NotificationDelivery`, and the UI should continue to show the app state.

For invite creation, SMTP failure should keep the pending invite and show an
actionable warning with a resend option. This avoids losing a valid invite after
directory validation succeeds.

### SMTP Mail Provider

V1 uses SMTP because an SMTP server is available and it avoids adding Microsoft
Graph mail permissions.

Add environment configuration for:

- SMTP host.
- SMTP port.
- SMTP username, when required.
- SMTP password, when required.
- TLS mode.
- From address.
- Reply-to address, when needed.

The provider interface should hide the implementation so Microsoft 365/Graph
mail can be added later without rewriting event or preference logic.

### Entra Directory Lookup

Add a directory lookup abstraction for invite validation.

The lookup should:

- Find a user by the submitted email.
- Confirm the account is a member account, not a guest.
- Confirm the submitted email is a Cedarville email or alias.
- Return stable identity details needed for invite validation and acceptance,
  including Entra object id, display name, primary email, and aliases when
  available.

The exact Microsoft Graph lookup shape must be verified during implementation
against Cedarville's tenant and app registration policy. Microsoft Graph's
current `Get user` and `List users` documentation lists `User.Read.All` as the
least privileged application permission for app-only user reads. The narrower
`User.ReadBasic.All` permission exposes basic profile fields, but may not be
sufficient for server-side member-account and alias validation. The v1 design
should therefore expect an app-only Graph lookup with `User.Read.All` unless a
tested delegated or narrower permission path proves it can reliably return the
required member and alias evidence.

Reference:

- [Microsoft Graph Get user permissions](https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0#permissions)
- [Microsoft Graph List users permissions](https://learn.microsoft.com/en-us/graph/api/user-list?view=graph-rest-1.0#permissions)
- [Microsoft Graph permissions reference for User.Read.All and User.ReadBasic.All](https://learn.microsoft.com/en-us/graph/permissions-reference#userreadall)

## User Experience

### App Details Page

Owners and admins see a collaborator invite section on app details.

The section includes:

- Email input for a Cedarville coworker.
- Submit action to validate and send an invite.
- Pending invite list with invited email, display name when available, inviter,
  expiration date, last sent date, and status.
- Resend action for pending invites.
- Revoke action for pending invites.

Collaborators do not see invite controls.

Accepted collaborators continue to appear in the existing app access summary.

### Invite Acceptance

The invite email links to an accept route.

Acceptance flow:

1. User opens the signed invite link.
2. If not signed in, the user goes through Entra sign-in.
3. The portal verifies the invite exists, is pending, and is not expired.
4. The portal verifies the signed-in Entra user matches the invite by object id,
   primary email, or approved alias.
5. The portal creates or confirms the local user record when needed.
6. The portal creates or confirms the `AppAccess` collaborator row.
7. The portal marks the invite accepted.
8. The user lands on the app details page.

If the signed-in account does not match the invite, the portal should show a
clear message and avoid revealing unrelated app details.

### Settings Page

Add a settings page reachable from the site header for signed-in users.

The first settings section is notification preferences. It includes:

- Global email notifications switch.
- Collaboration email toggle.
- App lifecycle email toggle.
- Publishing email toggle.

The settings page should be structured so future user preferences can be added
without changing the route or navigation model.

## Error Handling

- Unauthorized invite actions fail closed.
- Collaborators cannot invite, resend, or revoke invites.
- Unknown or external invitees are rejected before email is sent.
- Entra lookup failures show an actionable directory lookup message.
- SMTP failures are recorded in `NotificationDelivery`.
- Normal app mutations do not fail solely because an activity notification
  cannot be sent.
- Invite creation keeps the pending invite when SMTP delivery fails so owners
  and admins can resend.
- Expired or revoked invite links cannot grant access.
- Duplicate pending invites refresh or reuse the existing pending invite rather
  than creating confusing duplicates.

## Security And Privacy

- Invites are Cedarville-only: Entra member account plus Cedarville email or
  alias.
- Invite tokens are hashed at rest.
- Invite tokens expire after 14 days.
- Invite acceptance requires a matching signed-in Entra account.
- Invite acceptance grants portal app access only.
- GitHub repository access remains explicit and separate.
- Notification preferences cannot suppress access/invite mail.
- Delivery logs store metadata only.
- Email bodies should avoid secrets, credentials, connection strings, raw
  provider errors, and token-bearing URLs beyond the intended accept link sent
  to the invite recipient.
- App access authorization continues to flow through existing owner,
  collaborator, and admin checks.

## Audit Events

Keep the existing structured audit sink and add events for important invite and
preference actions.

Suggested audit events:

- `COLLABORATION_INVITE_SENT`
- `COLLABORATION_INVITE_RESENT`
- `COLLABORATION_INVITE_REVOKED`
- `COLLABORATION_INVITE_ACCEPTED`
- `COLLABORATION_INVITE_EXPIRED`
- `NOTIFICATION_PREFERENCES_UPDATED`
- `NOTIFICATION_DELIVERY_FAILED`

Audit details should include safe identifiers such as acting user id, app
request id, support reference, invite id, and target user/email. Audit details
must not include raw invite tokens or SMTP credentials.

## Testing Strategy

Use focused tests around the new services and the app details/settings surfaces.

Data model and validation:

- Missing notification preferences resolve to default-on.
- Pending invite uniqueness works per app and email.
- Expired, revoked, or accepted invites cannot be accepted again.
- Invite tokens are stored hashed.

Invite actions:

- Owners can send, resend, and revoke invites.
- Admins can send, resend, and revoke invites.
- Collaborators cannot send, resend, or revoke invites.
- Entra member plus Cedarville email or alias is eligible.
- Guest users and non-Cedarville addresses are rejected.
- Directory lookup unavailable blocks sending.
- Accepting an invite creates `AppAccess`.
- Accepting with the wrong signed-in account is blocked.
- Accepting an invite does not request GitHub access.

Notification service:

- Recipients are owner plus accepted collaborators.
- Actor is excluded when appropriate.
- Admins are not notified for every app unless directly involved.
- Global opt-out skips normal app activity notifications.
- Category opt-out skips only that category.
- Invite emails bypass preferences.
- SMTP success records `SENT`.
- SMTP failure records `FAILED` without storing email body or secrets.

UI:

- Owners and admins see invite controls on app details.
- Collaborators do not see invite controls.
- Pending invites show resend and revoke actions to owners/admins.
- Settings page renders notification toggles and saves changes.
- Notification emails link to settings.

Regression:

- Existing collaborator app access still works.
- Existing admin collaborator management still works.
- Existing download authorization remains quiet for unrelated users.
- Repository, publishing, repair, and deletion actions still complete if
  non-critical notification delivery fails.
- `npm test` passes.
- `npm run build` passes.

## Documentation Updates

Update setup docs and `.env.example` with SMTP and directory lookup settings.

Update portal docs to describe:

- Notification preference defaults and categories.
- Collaboration invite behavior.
- Invite expiration, resend, and revoke behavior.
- Cedarville-only invite eligibility.
- That accepting an invite grants portal app access only.
- How GitHub repository access remains a separate app details action.

## Implementation Notes

This design should be implemented through a detailed plan before code changes.
Likely implementation slices:

1. Data model and migrations.
2. Entra directory lookup abstraction and tests.
3. SMTP provider and notification delivery logging.
4. Notification preference settings page.
5. Collaboration invite actions and accept route.
6. App details invite UI.
7. Notification event integration across app lifecycle, repository, publishing,
   deletion, and collaboration actions.
8. Documentation and regression verification.
