# Audit event context

The admin Events page shows a portal username (the email prefix) and app name
for every row, independent of the order of fields in the expandable payload.
New events snapshot `username` and `appName` when written. This applies to the
shared audit helper, repository-access outcomes, and imported sign-in reviews.
Deletion events retain the app-name snapshot after the app record is removed.

Account events such as sign-in and profile updates have no app: `appName` is
`null`, displayed as **Not applicable**. Events without a human user reference
show **System**. Missing/deleted identities or failed context lookups remain
`null` and display **Unknown user** or **Unknown app** when an ID exists. Context
lookups are best effort; they do not suppress an audit event or turn required
audit writes into best-effort writes. Existing historical payloads are not
rewritten; the page resolves their IDs where possible.

## GitHub invitations and acceptance checks

- `REPOSITORY_ACCESS_REQUESTED`, `REPOSITORY_ACCESS_SUCCEEDED`, and
  `REPOSITORY_ACCESS_FAILED` describe invitation attempts, including resends.
- `REPOSITORY_ACCESS_CONFIRMATION_REQUESTED`,
  `REPOSITORY_ACCESS_CONFIRMATION_SUCCEEDED`, and
  `REPOSITORY_ACCESS_CONFIRMATION_FAILED` describe checks after invitation acceptance.
- Both request and result payloads contain `accessPurpose` (`invitation` or
  `confirmation`) and the same `correlationKey`. For MCP calls this is the
  supplied `idempotencyKey`, which is also retained in the result payload.
  Portal form submissions receive a fresh UUID correlation key.
- A successful check can still return `accessStatus: INVITED` if the invitation
  has not been accepted. `SUCCEEDED` describes the provider operation; the
  `accessStatus` and safe summary describe actual access.

The onboarding acceptance form explicitly marks confirmation calls. Invitation
and resend forms mark invitation calls. MCP callers can supply `accessPurpose`;
older callers that omit it are classified using the active per-actor GitHub
grant ledger: a non-revoked INVITED/GRANTED record means confirmation, otherwise
invitation. This inference cannot prove the intent of an older caller's resend.
Same-key MCP replays retain their existing idempotency behavior and do not write
another pair of events. Historical events keep their original event names.
