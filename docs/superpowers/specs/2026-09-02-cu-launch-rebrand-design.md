# CU Launch Rebrand Design

## Goal

Rebrand the external Cedarville App Portal experience as **CU Launch** while
preserving internal identifiers, routes, package names, deployment markers, and
managed-repository paths. The resulting interface should follow the supplied
CU Launch reference: a confident navy-and-gold launch identity, concise
launch-oriented language, and a simple operational experience for staff.

## Scope and Boundaries

- The official end-user product name is **CU Launch**.
- The primary action is **Launch New App**. This replaces visible uses of
  "Create New App" and equivalent calls to action.
- Internal code, routes, package names, database names, GitHub ownership
  markers, and `.codex/skills/cu-app-portal` paths remain unchanged.
- Historical design and implementation records remain historical records.
  Current user and operator documentation, generated PDFs, metadata, emails,
  and all visible portal screens use the new product name.
- No authentication, authorization, publishing, template, or repository
  behavior changes are part of this work.

## Experience Design

The app shell will gain a reusable CU Launch brand lockup. It uses a small
accessible SVG launch mark inspired by the supplied gold triangular/orbit mark,
the words "CU Launch," and the optional tagline "Launch your app. We handle
the rest." The mark will be rendered as a decorative image where adjacent text
provides the product name, so the accessible name stays concise.

The global design tokens will align to the supplied reference:

- Cedarville blue: `#0B1D3A`
- Cedarville gold: `#FFB300`
- Sky blue: `#1D4ED8`
- Slate: `#E6EAF0`
- White: `#FFFFFF`

The portal will use a Montserrat display face for headings and brand elements,
with its existing readable body face retained for long-form content. Buttons,
cards, navigation, status labels, and focus states will share the new tokens.
The home and login experiences will become unmistakably CU Launch while
maintaining the current responsive layout and existing keyboard behavior.

## Component and Copy Model

A `CuLaunchBrand` component will centralize the lockup so the header, footer,
login page, and high-emphasis landing content cannot drift. A shared display
copy constant will be used only for external product-name copy; it must not
replace technical strings such as GitHub repository descriptions or generated
skill identifiers that depend on the old internal name.

The visible-copy audit covers public, signed-in, administrative, onboarding,
settings, help, invitations, download, and error/recovery screens, plus page
metadata and email notifications. It replaces "CU App Portal" and
"Cedarville App Portal" with "CU Launch," and changes user-facing creation
verbs to launch language. It does not alter URLs or implementation identifiers.

## Documentation

Update current documentation that describes or displays the product: the root
README, portal setup and template-authoring guides, user documentation source,
and user-facing public PDFs. Regenerate both downloadable PDFs from the edited
sources and inspect their rendered output. Do not alter dated historical
specifications and plans solely to rewrite their historical context.

## Verification

Tests will first assert the CU Launch title and Launch New App action on the
home page, header, create flow, login page, and My Apps page. Existing affected
tests will be updated to assert the new user-visible language. The completed
work will run focused UI tests, the full Vitest suite, `npm run build`, PDF
generation and rendering checks, `git diff --check`, and a final case-
insensitive scan for obsolete product names and user-facing creation wording.
