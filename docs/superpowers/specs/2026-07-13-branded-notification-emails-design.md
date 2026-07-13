# Branded, Event-Specific Notification Emails — Design

**Date:** 2026-07-13
**Status:** Approved

## Problem

Every portal notification email uses the same generic two-line message —
"*{App} has a portal update*" plus a bare link — regardless of which of the
15 notification events fired. Recipients cannot tell what happened without
clicking through, and the email carries no Cedarville branding.

## Goals

- Each notification event gets a distinct, descriptive subject and body that
  says what happened, who did it (when known), and what to do next.
- All notification emails share a Cedarville-branded HTML layout matching the
  university's ServeCU/TeamDynamix email treatment (header, footer, colors).
- Plain-text alternative stays in sync with the HTML copy.
- No changes to notification call sites: enrichment happens inside the
  notification service using data it already has access to.

## Non-Goals

- No new detail payloads threaded through call sites (e.g., invitee email on
  invites). The service derives detail from the `AppRequest` record, the
  actor's user record, and the recipient list.
- No digesting/batching, localization, or new notification events.
- No inlined/attached images — header and footer images reference the same
  Cedarville-hosted URLs the ServeCU emails use.

## Decisions (confirmed with owner)

1. **Service-side enrichment** — call sites unchanged; the service widens its
   Prisma select and looks up the actor's display name.
2. **Event-specific subjects** — e.g. "{App} is now live", "Publish failed:
   {App}", not a uniform "App Portal update: {App}".
3. **Preferences link** — footer includes a "Manage email preferences" link to
   `{portal}/settings`, where per-category email toggles already exist.

## Architecture

### New module: `src/features/notifications/templates.ts`

- `renderAppEventEmail(context): { subject: string; text: string; html: string }`
- Context fields: `eventKey`, `appName`, `appHref` (portal detail link),
  `settingsHref`, `recipientDisplayName`, and optional `actorDisplayName`,
  `publishUrl`, `publishErrorSummary`, `publishingSetupErrorSummary`,
  `repositoryName`, `repositoryUrl`, `supportReference`, plus a variant for
  the deleted-app snapshot path (no DB row; app name only).
- Internal `renderBrandedLayout({ heading, bodyHtml })` produces the shared
  Cedarville shell (see Layout below).
- All interpolated strings are HTML-escaped. Error summaries are truncated
  (~300 chars) before rendering.

### Layout (from the ServeCU example email)

- 600px centered table layout, MSO-conditional-safe, `role="presentation"`
  tables, mobile `@media (max-width:620px)` stack rules.
- **Header:** full-width `#003865` bar containing the white CU logo
  (`https://d15k2d11r6t6rl.cloudfront.net/pub/bfra/7xelt3hy/epx/9jf/i4i/CU%20White%20logo.png`,
  150px), linked to the portal root.
- **Body:** white background; personalized greeting ("Hi {recipient},");
  one-sentence headline of the event; a detail table showing only rows that
  apply (Repository, Published URL, Error, Support reference, Performed by);
  a Cedarville-blue CTA button — "View app in portal" (or "Visit your site"
  for publish success, with a secondary portal link).
- **Footer:** divider; Cedarville tagline image
  (`https://www.cedarville.edu/images/default-source/email/admissions/2color_tagline_1line_pillar-slate-429x68.png`,
  429px); address line "Cedarville University | 251 N Main St. | Cedarville,
  OH 45314 | 1-800-CEDARVILLE | cedarville.edu" (link color `#00afdc`); and a
  "Manage email preferences" link to `{portal}/settings`.

### Per-event copy

| Event | Subject | Body gist / detail rows |
|---|---|---|
| APP_CREATED | New app created: {app} | {Actor} created {app} in the App Portal. Support reference. |
| EXISTING_APP_IMPORTED | App imported: {app} | Existing app imported into the portal. Repository row if present. |
| REPOSITORY_READY | Repository ready: {app} | Repo name + URL; code ready to clone. |
| REPOSITORY_FAILED | Repository setup failed: {app} | Setup did not complete; support reference for IT follow-up. |
| APP_DELETED | App deleted: {app} | Deleted by {actor}; details page no longer available. No CTA button. |
| APP_SHARED | You've been added to {app} | {Actor} gave you access to the app. |
| COLLABORATION_INVITE_SENT | Collaboration invite for {app} | {Actor} sent a collaboration invite. |
| COLLABORATION_INVITE_ACCEPTED | Invite accepted: {app} | {Actor} accepted the invite and now has access. |
| COLLABORATION_INVITE_REVOKED | Invite revoked: {app} | A collaboration invitation was withdrawn. |
| COLLABORATOR_REMOVED | Collaborator access removed: {app} | Neutral copy readable by both the removed user and the owner: "Collaborator access to {app} was removed{ by Actor}." |
| OWNER_REASSIGNED | Ownership changed: {app} | The app has a new owner{, reassigned by Actor}. |
| PUBLISH_SUCCEEDED | {app} is now live | Congratulatory headline; Published URL row; CTA "Visit your site" + portal link. |
| PUBLISH_FAILED | Publish failed: {app} | Latest publish attempt failed; Error row (truncated `publishErrorSummary`); support reference. |
| PUBLISHING_SETUP_NEEDS_REPAIR | Publishing needs attention: {app} | Setup issue detected that the portal can help repair; Error row (`publishingSetupErrorSummary`). |
| PUBLISHING_SETUP_BLOCKED | Publishing blocked: {app} | Publishing is blocked until resolved; Error row; contact IT with support reference. |

Deleted-app snapshot path (no `AppRequest` row) uses the APP_DELETED copy with
app name only.

### Service changes: `src/features/notifications/service.ts`

- Widen the `appRequest` select with `publishUrl`, `publishErrorSummary`,
  `publishingSetupErrorSummary`, `repositoryName`, `repositoryUrl`,
  `supportReference`.
- When `actorUserId` is set, look up the actor's `displayName`
  (single `prisma.user.findUnique`).
- Move message construction inside the recipient loop so the greeting is
  personalized per recipient; subject and event copy are identical across
  recipients.
- `buildMessage`/`buildDeletedAppMessage` are replaced by calls into the
  template module. Delivery recording, preference filtering, and error
  handling are unchanged.

## Error handling

- Template rendering is pure string construction; no new failure modes. A
  missing optional field simply omits its detail row.
- Actor lookup failure (user not found) renders actor-less copy.
- Mailer failures continue to be recorded per-recipient as `FAILED`, as today.

## Testing

- New `templates.test.ts`: per-event subject and body assertions; HTML
  escaping of app name/error text; detail rows render only when data present;
  greeting uses recipient name; preferences link present; publish-success CTA
  uses `publishUrl`.
- Update `service.test.ts`: existing assertions on the generic copy change to
  the new copy; add coverage for actor-name lookup and per-recipient greeting.
- Repo verification gates: `vitest` and `next build`.

## Risks

- Header/footer images are hosted on Cedarville's CDN (same URLs the ServeCU
  emails use). If those move, images break — the same exposure all other CU
  emails have. Copy remains readable without images (alt text set).
