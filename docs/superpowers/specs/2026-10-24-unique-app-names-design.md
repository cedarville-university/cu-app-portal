# Unique app names

New template apps must use a name unique across CU Launch, ignoring capitalization and surrounding spaces. Existing records and existing-app imports remain unchanged. New apps are compared against all existing app records.

Check availability after 500 ms without typing and immediately on blur. On conflict show “That app name is already in use. Please try another name.” Keep the entered form values so the user can correct the name. Ignore outdated responses and show a retry message if availability cannot be checked.

## Approaches

A browser-only lookup cannot protect direct submissions or concurrent creation. A unique index on existing names would reject databases that already contain duplicate names. Use a shared server precheck plus a nullable normalized unique key populated only for new template apps. This implements the approved global uniqueness behavior without changing old records. Existing names are already trimmed by creation/import validation.

Use existing Next.js server actions, Prisma, React, and Vitest. Authentication applies to availability queries. Conflicting final submissions return the same safe feedback, including unique-key races. Imported apps remain outside this new-app creation flow.
