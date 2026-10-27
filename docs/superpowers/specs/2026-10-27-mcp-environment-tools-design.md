# CU Launch MCP environment tools

Date: 2026-10-27
Status: Approved and implemented on 2026-10-27; deployment and plugin publication require separate verification

## Intent and approach

Add tools for reading and setting app environment values without making secrets
available through MCP. The user selected ordinary settings only. Secret entry
and replacement stay in the CU Launch UI. Write-only secret updates through MCP
were considered and rejected because secrets would enter conversation/tool inputs.

Reuse the portal's existing environment-variable service and app permissions.
Owners, collaborators, and portal administrators have the same app-specific
access they have in the settings UI. No new admin-only tool, delegated scope,
database migration, or provider permission is required by this design.

## Tools

`get_app_environment` accepts `appId`, `offset` (default 0), and `limit`
(default 25, maximum 100). Return portal-recorded custom variables ordered by
key and ID, with `key`, `isSecret`, `updatedAt`, and a disclosure status. Return
`value` only for ordinary settings that pass the sensitivity checks below.
Secrets return metadata with no value field. Include `nextOffset` and state
that these are saved portal settings, not a live Azure configuration inspection.
Do not read Key Vault or enumerate Azure settings for this read operation.

`set_app_environment` accepts `appId`, a `variables` array of 1–100 `{ key, value }`
entries, and a UUID `idempotencyKey` for the entire batch. Add or replace all
requested ordinary settings in one call. There is no
`isSecret` switch, deletion operation, or target/resource override. Use the
existing key/value validation and reserved-name protections. Reject existing
secret entries, including normalized-name collisions; never change their storage
classification. Reject duplicate normalized keys. Validate the entire batch,
including sensitivity checks, before making any changes. Resolve app and
provider targets on the server.

Reuse `saveEnvironmentVariables` with `isSecret: false` for every entry.
Unpublished apps save values for publishing; published apps apply all requested
settings with one Azure settings update, preserving unrelated settings and
avoiding a separate update/restart trigger per variable. Azure controls the
actual restart behavior; the tool does not promise an exact restart count.
Responses identify the saved keys and application behavior but never echo
submitted values. No publish or additional deployment is dispatched. Validation
failures change nothing; provider/database failures are not a cross-system
transaction and must not be presented as an atomic rollback.

## Secret protection and authorization

Authorize each call against the authenticated actor before accessing variables
or constructing provider dependencies. Reauthorize writes before looking up
idempotent results so access removal also affects replay. Missing and inaccessible
apps receive the same safe not-found response.

Select secret metadata separately from ordinary values so a read never loads
the value column for secret rows. Withhold ordinary values with sensitive names
(credentials, passwords, tokens, keys, connection strings, and similar names)
or recognizable credential content. Reject such names/content on writes and
direct the user to CU Launch. Withhold the whole value rather than returning a
partially redacted credential. Use conservative checks and test case variants.
These checks supplement the saved secret classification; they cannot identify
every arbitrary secret incorrectly saved as an ordinary value. Plugin guidance
must tell users to keep credentials in secret settings and never solicit them.

Do not put values in audit events, mutation responses, cached results, error
messages, or logs. Audit successful writes using actor/app/key metadata only.
Use fixed safe validation/provider errors, including when an upstream exception
contains the submitted value. Keep the idempotency input digest and existing
safe replay envelope, with a dedicated write rate limit and existing read limit.
Mark reads read-only and writes mutating, potentially destructive, and open-world.

Serialize all environment saves for the same app across both UI and MCP using
an existing-database PostgreSQL advisory lock. Acquire it before shared-service
validation and hold it through provider/database updates, using the transaction
connection for database work. A concurrent secret creation must finish before an
ordinary update can validate, so the update cannot overwrite the new secret or
create a normalized-name collision. The lock is transaction-scoped and bounded
by a two-minute transaction timeout; provider/database failures may still leave
Azure changes applied. No database migration or new permission is needed.

## Implementation and verification

Add an actor-aware service and thin MCP adapters; register both tools. Update
the workspace plugin guidance, tool counts/contracts, and operator documentation
to distinguish ordinary setting changes from secret changes in CU Launch.
Explain the possible live-app restart before a user requests a write.

Verify owner/collaborator/admin access, quiet denial, access removal on replay,
secret value omission from both text and structured output, sensitive-name and
credential-content rejection, reserved keys, normalized secret collisions, no
Key Vault access, preserved unrelated settings, metadata-only audit/results,
safe provider failures, batch validation before side effects, one Azure settings
update per batch, rate limits, and idempotent writes. Run relevant service,
MCP, documentation, and secret-hygiene tests and the production build.

Implementation remains local unless the user requests commit/push or deployment.
