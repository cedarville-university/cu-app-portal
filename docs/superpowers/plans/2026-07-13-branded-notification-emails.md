# Branded Notification Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic "App has a portal update" notification email with Cedarville-branded HTML emails whose subject and body describe the specific event that happened.

**Architecture:** A new pure template module (`src/features/notifications/templates.ts`) renders `{subject, text, html}` from an event context. The notification service (`service.ts`) widens its Prisma select, looks up the actor's display name, and renders per recipient (personalized greeting). Call sites are untouched.

**Tech Stack:** TypeScript, Next.js, Prisma, nodemailer, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-13-branded-notification-emails-design.md`

## Global Constraints

- No new npm dependencies.
- No changes to any notification call site (`safeNotifyAppEvent` callers) or to `mailer.ts`, `production.ts`, `safe-notify.ts`, `preferences.ts`, `types.ts`.
- All user-supplied strings (app name, actor name, recipient name, error summaries, URLs) must be HTML-escaped in the HTML part. Subjects are plain text headers — never HTML-escape them.
- Error summaries truncate to 300 characters before rendering.
- Portal app link stays `{appUrl}/download/{appRequestId}` (existing tests assert this path).
- Brand constants (from the ServeCU reference email):
  - Header/CTA blue: `#003865`
  - Footer link blue: `#00afdc`
  - White CU logo: `https://d15k2d11r6t6rl.cloudfront.net/pub/bfra/7xelt3hy/epx/9jf/i4i/CU%20White%20logo.png` (width 150)
  - Tagline image: `https://www.cedarville.edu/images/default-source/email/admissions/2color_tagline_1line_pillar-slate-429x68.png` (width 429)
  - Address line: `Cedarville University | 251 N Main St. | Cedarville, OH 45314 | 1-800-CEDARVILLE`
- Deleted-app copy must keep the exact sentence `The app details page is no longer available in the portal.` (asserted by an existing test).
- Verification gates: `npm test` (vitest) and `npm run build` (next build). `tsc` has ~258 pre-existing test-file errors — compare against baseline, don't chase them.
- Code style: double quotes, 2-space indent, `function` declarations for helpers (match `service.ts`).

---

### Task 1: Template module — branded layout with generic copy

**Files:**
- Create: `src/features/notifications/templates.ts`
- Test: `src/features/notifications/templates.test.ts`

**Interfaces:**
- Consumes: `AppNotificationEventKey` from `./types`.
- Produces (later tasks rely on these exact shapes):

```typescript
export type AppEventEmailContext = {
  eventKey: AppNotificationEventKey;
  appName: string;
  recipientDisplayName: string;
  portalUrl: string;        // may have a trailing slash; module normalizes
  appHref: string | null;   // null = app row gone (deleted snapshot); omits CTA
  actorDisplayName?: string | null;
  publishUrl?: string | null;
  publishErrorSummary?: string | null;
  publishingSetupErrorSummary?: string | null;
  repositoryName?: string | null;
  repositoryUrl?: string | null;
  supportReference?: string | null;
};

export type RenderedEmail = { subject: string; text: string; html: string };

export function renderAppEventEmail(context: AppEventEmailContext): RenderedEmail;
```

- [ ] **Step 1: Write the failing layout tests**

Create `src/features/notifications/templates.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { renderAppEventEmail, type AppEventEmailContext } from "./templates";

const baseContext: AppEventEmailContext = {
  eventKey: "REPOSITORY_READY",
  appName: "Campus Forms",
  recipientDisplayName: "Marc Hollins",
  portalUrl: "https://portal.example.edu/",
  appHref: "https://portal.example.edu/download/request-123",
};

describe("renderAppEventEmail branded layout", () => {
  it("greets the recipient by name in html and text", () => {
    const email = renderAppEventEmail(baseContext);

    expect(email.html).toContain("Hi Marc Hollins,");
    expect(email.text).toContain("Hi Marc Hollins,");
  });

  it("renders the Cedarville header logo linked to the portal", () => {
    const email = renderAppEventEmail(baseContext);

    expect(email.html).toContain(
      "https://d15k2d11r6t6rl.cloudfront.net/pub/bfra/7xelt3hy/epx/9jf/i4i/CU%20White%20logo.png",
    );
    expect(email.html).toContain('href="https://portal.example.edu"');
    expect(email.html).toContain("#003865");
  });

  it("renders the footer tagline image and university address", () => {
    const email = renderAppEventEmail(baseContext);

    expect(email.html).toContain(
      "2color_tagline_1line_pillar-slate-429x68.png",
    );
    expect(email.html).toContain(
      "Cedarville University | 251 N Main St. | Cedarville, OH 45314 | 1-800-CEDARVILLE",
    );
    expect(email.text).toContain(
      "Cedarville University | 251 N Main St. | Cedarville, OH 45314 | 1-800-CEDARVILLE",
    );
  });

  it("links to notification preferences in html and text", () => {
    const email = renderAppEventEmail(baseContext);

    expect(email.html).toContain(
      'href="https://portal.example.edu/settings"',
    );
    expect(email.html).toContain("Manage email preferences");
    expect(email.text).toContain(
      "Manage email preferences: https://portal.example.edu/settings",
    );
  });

  it("renders a CTA button linking to the app page", () => {
    const email = renderAppEventEmail(baseContext);

    expect(email.html).toContain(
      'href="https://portal.example.edu/download/request-123"',
    );
    expect(email.html).toContain("View app in portal");
    expect(email.text).toContain(
      "View app in portal: https://portal.example.edu/download/request-123",
    );
  });

  it("omits the CTA when appHref is null", () => {
    const email = renderAppEventEmail({ ...baseContext, appHref: null });

    expect(email.html).not.toContain("View app in portal");
    expect(email.text).not.toContain("View app in portal");
  });

  it("escapes HTML in app and recipient names", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      appName: '<script>alert("x")</script>',
      recipientDisplayName: "Marc & Co. <admin>",
    });

    expect(email.html).toContain(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(email.html).toContain("Marc &amp; Co. &lt;admin&gt;");
    expect(email.html).not.toContain("<script>");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/notifications/templates.test.ts`
Expected: FAIL — cannot resolve `./templates`.

- [ ] **Step 3: Implement the template module with generic fallback copy**

Create `src/features/notifications/templates.ts`:

```typescript
import type { AppNotificationEventKey } from "./types";

export type AppEventEmailContext = {
  eventKey: AppNotificationEventKey;
  appName: string;
  recipientDisplayName: string;
  portalUrl: string;
  appHref: string | null;
  actorDisplayName?: string | null;
  publishUrl?: string | null;
  publishErrorSummary?: string | null;
  publishingSetupErrorSummary?: string | null;
  repositoryName?: string | null;
  repositoryUrl?: string | null;
  supportReference?: string | null;
};

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

const CU_BLUE = "#003865";
const CU_LINK_BLUE = "#00afdc";
const CU_LOGO_WHITE_URL =
  "https://d15k2d11r6t6rl.cloudfront.net/pub/bfra/7xelt3hy/epx/9jf/i4i/CU%20White%20logo.png";
const CU_TAGLINE_URL =
  "https://www.cedarville.edu/images/default-source/email/admissions/2color_tagline_1line_pillar-slate-429x68.png";
const CU_ADDRESS_LINE =
  "Cedarville University | 251 N Main St. | Cedarville, OH 45314 | 1-800-CEDARVILLE";
const ERROR_SUMMARY_MAX_LENGTH = 300;

type DetailRow = {
  label: string;
  value: string;
  href?: string;
};

type Cta = {
  label: string;
  href: string;
};

type EventContent = {
  subject: string;
  headline: string;
  detail?: string;
  rows: DetailRow[];
  cta: Cta | null;
  secondaryCta?: Cta;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1)}…`;
}

function buildEventContent(context: AppEventEmailContext): EventContent {
  return {
    subject: `App Portal update: ${context.appName}`,
    headline: `${context.appName} has a portal update.`,
    rows: [],
    cta: context.appHref
      ? { label: "View app in portal", href: context.appHref }
      : null,
  };
}

function renderDetailRowsHtml(rows: DetailRow[]) {
  if (rows.length === 0) {
    return "";
  }

  const rowsHtml = rows
    .map((row) => {
      const value = row.href
        ? `<a href="${escapeHtml(row.href)}" target="_blank" style="color: ${CU_LINK_BLUE};">${escapeHtml(row.value)}</a>`
        : escapeHtml(row.value);

      return `<tr><td style="padding: 4px 12px 4px 0; font-size: 14px; color: #000000; font-weight: bold; vertical-align: top; white-space: nowrap;">${escapeHtml(row.label)}:</td><td style="padding: 4px 0; font-size: 14px; color: #656565; word-break: break-word;">${value}</td></tr>`;
    })
    .join("");

  return `<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 8px;">${rowsHtml}</table>`;
}

function renderCtaHtml(cta: Cta) {
  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px auto 8px;"><tr><td style="background-color: ${CU_BLUE}; border-radius: 4px;" align="center"><a href="${escapeHtml(cta.href)}" target="_blank" style="display: inline-block; padding: 12px 28px; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none;">${escapeHtml(cta.label)}</a></td></tr></table>`;
}

function renderSecondaryCtaHtml(cta: Cta) {
  return `<p style="margin: 8px 0 0; font-size: 13px; text-align: center;"><a href="${escapeHtml(cta.href)}" target="_blank" style="color: ${CU_LINK_BLUE}; text-decoration: underline;">${escapeHtml(cta.label)}</a></p>`;
}

function renderBrandedHtml({
  context,
  content,
  portalUrl,
  settingsHref,
}: {
  context: AppEventEmailContext;
  content: EventContent;
  portalUrl: string;
  settingsHref: string;
}) {
  const detailHtml = content.detail
    ? `<p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5;">${escapeHtml(content.detail)}</p>`
    : "";
  const ctaHtml = content.cta ? renderCtaHtml(content.cta) : "";
  const secondaryCtaHtml = content.secondaryCta
    ? renderSecondaryCtaHtml(content.secondaryCta)
    : "";

  return `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(content.subject)}</title>
<style>
  body { margin: 0; padding: 0; -webkit-text-size-adjust: none; text-size-adjust: none; }
  p { line-height: inherit; }
  @media (max-width: 620px) {
    .row-content { width: 100% !important; }
  }
</style>
</head>
<body style="background-color: #ffffff; margin: 0; padding: 0;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff;">
    <tr>
      <td>
        <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: ${CU_BLUE};">
          <tr>
            <td align="center" style="padding: 10px 0 15px;">
              <a href="${escapeHtml(portalUrl)}" target="_blank"><img src="${CU_LOGO_WHITE_URL}" width="150" alt="Cedarville University logo" style="display: block; height: auto; border: 0;"></a>
            </td>
          </tr>
        </table>
        <table class="row-content" align="center" width="600" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 600px; max-width: 600px; margin: 0 auto; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; color: #101112;">
          <tr>
            <td style="padding: 25px 20px;">
              <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5;">Hi ${escapeHtml(context.recipientDisplayName)},</p>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5; color: #000000;"><strong>${escapeHtml(content.headline)}</strong></p>
              ${detailHtml}
              ${renderDetailRowsHtml(content.rows)}
              ${ctaHtml}
              ${secondaryCtaHtml}
            </td>
          </tr>
        </table>
        <table class="row-content" align="center" width="600" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width: 600px; max-width: 600px; margin: 0 auto;">
          <tr>
            <td style="padding: 5px 20px;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="border-top: 2px solid #dddddd; font-size: 1px; line-height: 1px;">&#8202;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 10px 20px 0;">
              <img src="${CU_TAGLINE_URL}" width="429" alt="Cedarville logo and the University tagline - for the WORD of GOD and the TESTIMONY of JESUS CHRIST" style="display: block; height: auto; border: 0; max-width: 100%;">
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 10px 20px 25px; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 12px; line-height: 1.4; color: #101112;">
              <p style="margin: 0;">${CU_ADDRESS_LINE} | <a href="https://www.cedarville.edu" target="_blank" style="text-decoration: underline; color: ${CU_LINK_BLUE};">cedarville.edu</a></p>
              <p style="margin: 8px 0 0;"><a href="${escapeHtml(settingsHref)}" target="_blank" style="text-decoration: underline; color: ${CU_LINK_BLUE};">Manage email preferences</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderText(
  context: AppEventEmailContext,
  content: EventContent,
  settingsHref: string,
) {
  const lines: string[] = [
    `Hi ${context.recipientDisplayName},`,
    "",
    content.headline,
  ];

  if (content.detail) {
    lines.push("", content.detail);
  }

  for (const row of content.rows) {
    const value =
      row.href && row.href !== row.value
        ? `${row.value} (${row.href})`
        : row.value;
    lines.push("", `${row.label}: ${value}`);
  }

  if (content.cta) {
    lines.push("", `${content.cta.label}: ${content.cta.href}`);
  }

  if (content.secondaryCta) {
    lines.push(
      "",
      `${content.secondaryCta.label}: ${content.secondaryCta.href}`,
    );
  }

  lines.push("", `Manage email preferences: ${settingsHref}`, "", CU_ADDRESS_LINE);

  return lines.join("\n");
}

export function renderAppEventEmail(
  context: AppEventEmailContext,
): RenderedEmail {
  const portalUrl = context.portalUrl.replace(/\/$/, "");
  const settingsHref = `${portalUrl}/settings`;
  const content = buildEventContent(context);

  return {
    subject: content.subject,
    text: renderText(context, content, settingsHref),
    html: renderBrandedHtml({ context, content, portalUrl, settingsHref }),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/notifications/templates.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/notifications/templates.ts src/features/notifications/templates.test.ts
git commit -m "feat: add Cedarville-branded notification email layout"
```

---

### Task 2: Event-specific copy for all 15 events

**Files:**
- Modify: `src/features/notifications/templates.ts` (replace `buildEventContent` only)
- Test: `src/features/notifications/templates.test.ts` (append a describe block)

**Interfaces:**
- Consumes: everything from Task 1 unchanged (`AppEventEmailContext`, `renderAppEventEmail`, `DetailRow`, `Cta`, `EventContent`, `truncate`, `ERROR_SUMMARY_MAX_LENGTH`).
- Produces: no signature changes — only `buildEventContent` internals. Task 3+ rely on the subjects/copy asserted below.

- [ ] **Step 1: Write the failing per-event tests**

Append to `src/features/notifications/templates.test.ts`:

```typescript
describe("renderAppEventEmail event copy", () => {
  it("APP_CREATED names the actor and includes the support reference", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "APP_CREATED",
      actorDisplayName: "Owner User",
      supportReference: "CU-123",
    });

    expect(email.subject).toBe("New app created: Campus Forms");
    expect(email.text).toContain(
      "Owner User created Campus Forms in the Cedarville App Portal.",
    );
    expect(email.text).toContain("Support reference: CU-123");
    expect(email.html).toContain("CU-123");
  });

  it("APP_CREATED falls back to actor-less copy", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "APP_CREATED",
    });

    expect(email.text).toContain(
      "A portal user created Campus Forms in the Cedarville App Portal.",
    );
  });

  it("EXISTING_APP_IMPORTED includes the repository row", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "EXISTING_APP_IMPORTED",
      actorDisplayName: "Owner User",
      repositoryName: "cu-campus-forms",
      repositoryUrl: "https://github.com/cedarville/cu-campus-forms",
    });

    expect(email.subject).toBe("App imported: Campus Forms");
    expect(email.text).toContain(
      "Campus Forms was imported into the Cedarville App Portal by Owner User.",
    );
    expect(email.html).toContain(
      'href="https://github.com/cedarville/cu-campus-forms"',
    );
    expect(email.text).toContain(
      "Repository: cu-campus-forms (https://github.com/cedarville/cu-campus-forms)",
    );
  });

  it("REPOSITORY_READY announces the repository", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "REPOSITORY_READY",
      repositoryName: "cu-campus-forms",
    });

    expect(email.subject).toBe("Repository ready: Campus Forms");
    expect(email.text).toContain(
      "The source code repository for Campus Forms is ready.",
    );
    expect(email.text).toContain("Repository: cu-campus-forms");
  });

  it("REPOSITORY_FAILED points at IT with the support reference", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "REPOSITORY_FAILED",
      supportReference: "CU-123",
    });

    expect(email.subject).toBe("Repository setup failed: Campus Forms");
    expect(email.text).toContain(
      "The portal could not finish setting up the repository for Campus Forms.",
    );
    expect(email.text).toContain("Support reference: CU-123");
  });

  it("APP_DELETED keeps the legacy sentence and drops the CTA", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "APP_DELETED",
      appHref: null,
      actorDisplayName: "Owner User",
    });

    expect(email.subject).toBe("App deleted: Campus Forms");
    expect(email.text).toContain(
      "Campus Forms has been deleted from the Cedarville App Portal by Owner User.",
    );
    expect(email.text).toContain(
      "The app details page is no longer available in the portal.",
    );
    expect(email.html).not.toContain("View app in portal");
  });

  it("APP_SHARED tells the recipient who granted access", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "APP_SHARED",
      actorDisplayName: "Admin User",
    });

    expect(email.subject).toBe("You've been added to Campus Forms");
    expect(email.text).toContain(
      "Admin User gave you access to Campus Forms.",
    );
  });

  it("COLLABORATION_INVITE_SENT names the sender", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "COLLABORATION_INVITE_SENT",
      actorDisplayName: "Owner User",
    });

    expect(email.subject).toBe("Collaboration invite for Campus Forms");
    expect(email.text).toContain(
      "Owner User sent a collaboration invite for Campus Forms.",
    );
  });

  it("COLLABORATION_INVITE_ACCEPTED names the accepter", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "COLLABORATION_INVITE_ACCEPTED",
      actorDisplayName: "New Collaborator",
    });

    expect(email.subject).toBe("Invite accepted: Campus Forms");
    expect(email.text).toContain(
      "New Collaborator accepted a collaboration invite for Campus Forms and now has access.",
    );
  });

  it("COLLABORATION_INVITE_REVOKED explains the withdrawal", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "COLLABORATION_INVITE_REVOKED",
      actorDisplayName: "Owner User",
    });

    expect(email.subject).toBe("Invite revoked: Campus Forms");
    expect(email.text).toContain(
      "A collaboration invitation for Campus Forms was withdrawn by Owner User.",
    );
  });

  it("COLLABORATOR_REMOVED reads correctly for both audiences", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "COLLABORATOR_REMOVED",
      actorDisplayName: "Owner User",
    });

    expect(email.subject).toBe("Collaborator access removed: Campus Forms");
    expect(email.text).toContain(
      "Collaborator access to Campus Forms was removed by Owner User.",
    );
  });

  it("OWNER_REASSIGNED describes the change", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "OWNER_REASSIGNED",
      actorDisplayName: "Admin User",
    });

    expect(email.subject).toBe("Ownership changed: Campus Forms");
    expect(email.text).toContain(
      "Campus Forms has a new owner, reassigned by Admin User.",
    );
  });

  it("PUBLISH_SUCCEEDED uses the live site as the CTA", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "PUBLISH_SUCCEEDED",
      publishUrl: "https://campus-forms.azurewebsites.net",
    });

    expect(email.subject).toBe("Campus Forms is now live");
    expect(email.text).toContain(
      "the latest publish of Campus Forms finished successfully",
    );
    expect(email.text).toContain(
      "Visit your site: https://campus-forms.azurewebsites.net",
    );
    expect(email.html).toContain(
      'href="https://campus-forms.azurewebsites.net"',
    );
    expect(email.text).toContain(
      "View app in portal: https://portal.example.edu/download/request-123",
    );
  });

  it("PUBLISH_SUCCEEDED falls back to the portal CTA without a publish URL", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "PUBLISH_SUCCEEDED",
    });

    expect(email.text).toContain(
      "View app in portal: https://portal.example.edu/download/request-123",
    );
    expect(email.text).not.toContain("Visit your site");
  });

  it("PUBLISH_FAILED shows the truncated error and support reference", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "PUBLISH_FAILED",
      publishErrorSummary: "x".repeat(400),
      supportReference: "CU-123",
    });

    expect(email.subject).toBe("Publish failed: Campus Forms");
    expect(email.text).toContain(
      "The latest attempt to publish Campus Forms did not complete.",
    );
    expect(email.text).toContain(`Error: ${"x".repeat(299)}…`);
    expect(email.text).not.toContain("x".repeat(300));
    expect(email.text).toContain("Support reference: CU-123");
  });

  it("PUBLISHING_SETUP_NEEDS_REPAIR includes the setup error", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "PUBLISHING_SETUP_NEEDS_REPAIR",
      publishingSetupErrorSummary: "Missing deployment credentials",
      supportReference: "CU-123",
    });

    expect(email.subject).toBe("Publishing needs attention: Campus Forms");
    expect(email.text).toContain(
      "The portal found a problem with the publishing setup for Campus Forms.",
    );
    expect(email.text).toContain("Error: Missing deployment credentials");
  });

  it("PUBLISHING_SETUP_BLOCKED directs the recipient to IT", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "PUBLISHING_SETUP_BLOCKED",
      publishingSetupErrorSummary: "Subscription quota exceeded",
      supportReference: "CU-123",
    });

    expect(email.subject).toBe("Publishing blocked: Campus Forms");
    expect(email.text).toContain(
      "Publishing for Campus Forms is blocked until its publishing setup is fixed.",
    );
    expect(email.text).toContain("Error: Subscription quota exceeded");
    expect(email.text).toContain("Support reference: CU-123");
  });

  it("escapes HTML in error summaries", () => {
    const email = renderAppEventEmail({
      ...baseContext,
      eventKey: "PUBLISH_FAILED",
      publishErrorSummary: 'Deploy <b>failed</b> & "aborted"',
    });

    expect(email.html).toContain(
      "Deploy &lt;b&gt;failed&lt;/b&gt; &amp; &quot;aborted&quot;",
    );
    expect(email.html).not.toContain("<b>failed</b>");
  });
});
```

- [ ] **Step 2: Run tests to verify the new block fails**

Run: `npx vitest run src/features/notifications/templates.test.ts`
Expected: FAIL — new tests get the generic "App Portal update:" subject; Task 1's layout tests still PASS.

- [ ] **Step 3: Replace `buildEventContent` with the per-event switch**

In `src/features/notifications/templates.ts`, replace the entire `buildEventContent` function with:

```typescript
function buildEventContent(context: AppEventEmailContext): EventContent {
  const { appName, appHref, actorDisplayName } = context;
  const byActor = actorDisplayName ? ` by ${actorDisplayName}` : "";
  const viewApp: Cta | null = appHref
    ? { label: "View app in portal", href: appHref }
    : null;
  const supportRows: DetailRow[] = context.supportReference
    ? [{ label: "Support reference", value: context.supportReference }]
    : [];
  const repositoryRows: DetailRow[] = context.repositoryName
    ? [
        {
          label: "Repository",
          value: context.repositoryName,
          href: context.repositoryUrl ?? undefined,
        },
      ]
    : [];

  function errorRows(summary: string | null | undefined): DetailRow[] {
    return summary
      ? [
          {
            label: "Error",
            value: truncate(summary, ERROR_SUMMARY_MAX_LENGTH),
          },
        ]
      : [];
  }

  switch (context.eventKey) {
    case "APP_CREATED":
      return {
        subject: `New app created: ${appName}`,
        headline: `${actorDisplayName ?? "A portal user"} created ${appName} in the Cedarville App Portal.`,
        detail:
          "The portal is setting up the app now. You can follow its progress on the app page.",
        rows: supportRows,
        cta: viewApp,
      };
    case "EXISTING_APP_IMPORTED":
      return {
        subject: `App imported: ${appName}`,
        headline: `${appName} was imported into the Cedarville App Portal${byActor}.`,
        detail:
          "Its repository and publishing are now managed through the portal.",
        rows: [...repositoryRows, ...supportRows],
        cta: viewApp,
      };
    case "REPOSITORY_READY":
      return {
        subject: `Repository ready: ${appName}`,
        headline: `The source code repository for ${appName} is ready.`,
        detail: "You can open the repository and start working on your app.",
        rows: repositoryRows,
        cta: viewApp,
      };
    case "REPOSITORY_FAILED":
      return {
        subject: `Repository setup failed: ${appName}`,
        headline: `The portal could not finish setting up the repository for ${appName}.`,
        detail:
          "You can retry from the app page. If the problem continues, contact Information Technology and mention the support reference below.",
        rows: supportRows,
        cta: viewApp,
      };
    case "APP_DELETED":
      return {
        subject: `App deleted: ${appName}`,
        headline: `${appName} has been deleted from the Cedarville App Portal${byActor}.`,
        detail: "The app details page is no longer available in the portal.",
        rows: [],
        cta: null,
      };
    case "APP_SHARED":
      return {
        subject: `You've been added to ${appName}`,
        headline: `${actorDisplayName ?? "A portal administrator"} gave you access to ${appName}.`,
        detail: "You can now view and collaborate on this app in the portal.",
        rows: [],
        cta: viewApp,
      };
    case "COLLABORATION_INVITE_SENT":
      return {
        subject: `Collaboration invite for ${appName}`,
        headline: actorDisplayName
          ? `${actorDisplayName} sent a collaboration invite for ${appName}.`
          : `A collaboration invite was sent for ${appName}.`,
        detail: "Invited users get access to the app once they accept.",
        rows: [],
        cta: viewApp,
      };
    case "COLLABORATION_INVITE_ACCEPTED":
      return {
        subject: `Invite accepted: ${appName}`,
        headline: `${actorDisplayName ?? "An invited user"} accepted a collaboration invite for ${appName} and now has access.`,
        rows: [],
        cta: viewApp,
      };
    case "COLLABORATION_INVITE_REVOKED":
      return {
        subject: `Invite revoked: ${appName}`,
        headline: `A collaboration invitation for ${appName} was withdrawn${byActor}.`,
        detail:
          "The invited user can no longer use that invitation to join the app.",
        rows: [],
        cta: viewApp,
      };
    case "COLLABORATOR_REMOVED":
      return {
        subject: `Collaborator access removed: ${appName}`,
        headline: `Collaborator access to ${appName} was removed${byActor}.`,
        detail:
          "If this change affects your account, you no longer have access to this app in the portal.",
        rows: [],
        cta: viewApp,
      };
    case "OWNER_REASSIGNED":
      return {
        subject: `Ownership changed: ${appName}`,
        headline: `${appName} has a new owner${actorDisplayName ? `, reassigned by ${actorDisplayName}` : ""}.`,
        detail: "The owner manages collaborators and app settings in the portal.",
        rows: [],
        cta: viewApp,
      };
    case "PUBLISH_SUCCEEDED":
      return {
        subject: `${appName} is now live`,
        headline: `Good news — the latest publish of ${appName} finished successfully.`,
        detail: context.publishUrl
          ? "Your app is live at the address below."
          : undefined,
        rows: context.publishUrl
          ? [
              {
                label: "Published address",
                value: context.publishUrl,
                href: context.publishUrl,
              },
            ]
          : [],
        cta: context.publishUrl
          ? { label: "Visit your site", href: context.publishUrl }
          : viewApp,
        secondaryCta:
          context.publishUrl && appHref
            ? { label: "View app in portal", href: appHref }
            : undefined,
      };
    case "PUBLISH_FAILED":
      return {
        subject: `Publish failed: ${appName}`,
        headline: `The latest attempt to publish ${appName} did not complete.`,
        detail:
          "Review the error below and try publishing again from the portal. If the problem continues, contact Information Technology and mention the support reference.",
        rows: [...errorRows(context.publishErrorSummary), ...supportRows],
        cta: viewApp,
      };
    case "PUBLISHING_SETUP_NEEDS_REPAIR":
      return {
        subject: `Publishing needs attention: ${appName}`,
        headline: `The portal found a problem with the publishing setup for ${appName}.`,
        detail:
          "Open the app in the portal to repair the publishing setup, then try publishing again.",
        rows: [
          ...errorRows(context.publishingSetupErrorSummary),
          ...supportRows,
        ],
        cta: viewApp,
      };
    case "PUBLISHING_SETUP_BLOCKED":
      return {
        subject: `Publishing blocked: ${appName}`,
        headline: `Publishing for ${appName} is blocked until its publishing setup is fixed.`,
        detail:
          "Contact Information Technology and mention the support reference below to get publishing working again.",
        rows: [
          ...errorRows(context.publishingSetupErrorSummary),
          ...supportRows,
        ],
        cta: viewApp,
      };
  }
}
```

Note: the switch is exhaustive over `AppNotificationEventKey` — no `default` clause. If a new event key is added to the Prisma enum later, TypeScript fails compilation here, which is the desired reminder to write copy for it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/notifications/templates.test.ts`
Expected: PASS (24 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/notifications/templates.ts src/features/notifications/templates.test.ts
git commit -m "feat: event-specific copy for all portal notification emails"
```

---

### Task 3: Wire `sendAppNotification` to the templates

**Files:**
- Modify: `src/features/notifications/service.ts`
- Test: `src/features/notifications/service.test.ts`

**Interfaces:**
- Consumes: `renderAppEventEmail`, `AppEventEmailContext` from `./templates` (Task 1/2 signatures).
- Produces: `sendAppNotification` keeps its exact public signature (`SendAppNotificationInput` unchanged). New behavior later tasks/tests rely on: `prisma.user.findUnique` is called for `actorUserId`, and each recipient gets an individually rendered message.

- [ ] **Step 1: Update the prisma mock and add failing tests**

In `src/features/notifications/service.test.ts`, update the mock at the top of the file to add `findUnique`:

```typescript
vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findUnique: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    notificationDelivery: { create: vi.fn() },
  },
}));
```

In the `sendAppNotification` describe's `beforeEach`, add a default after the existing `findMany` line:

```typescript
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
```

Then append these tests inside `describe("sendAppNotification", ...)`:

```typescript
  it("renders event-specific subjects and personalized greetings", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      appName: "Campus Forms",
      supportReference: "CU-123",
      userId: "owner-123",
      user: {
        id: "owner-123",
        email: "owner@cedarville.edu",
        displayName: "Owner User",
        notificationPreference: null,
      },
      collaborators: [
        {
          user: {
            id: "collab-123",
            email: "collab@cedarville.edu",
            displayName: "Collaborator User",
            notificationPreference: null,
          },
        },
      ],
    } as never);
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await sendAppNotification({
      appRequestId: "request-123",
      eventKey: "REPOSITORY_READY",
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@cedarville.edu",
        subject: "Repository ready: Campus Forms",
        html: expect.stringContaining("Hi Owner User,"),
      }),
    );
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "collab@cedarville.edu",
        html: expect.stringContaining("Hi Collaborator User,"),
      }),
    );
  });

  it("looks up the actor and names them in the message", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      appName: "Campus Forms",
      supportReference: "CU-123",
      userId: "owner-123",
      user: {
        id: "owner-123",
        email: "owner@cedarville.edu",
        displayName: "Owner User",
        notificationPreference: null,
      },
      collaborators: [],
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      displayName: "Admin User",
    } as never);
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await sendAppNotification({
      appRequestId: "request-123",
      eventKey: "APP_SHARED",
      actorUserId: "admin-123",
      directRecipientUserIds: [],
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "admin-123" },
      select: { displayName: true },
    });
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "You've been added to Campus Forms",
        text: expect.stringContaining(
          "Admin User gave you access to Campus Forms.",
        ),
      }),
    );
  });

  it("includes the published URL for publish success", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
      id: "request-123",
      appName: "Campus Forms",
      supportReference: "CU-123",
      publishUrl: "https://campus-forms.azurewebsites.net",
      userId: "owner-123",
      user: {
        id: "owner-123",
        email: "owner@cedarville.edu",
        displayName: "Owner User",
        notificationPreference: null,
      },
      collaborators: [],
    } as never);
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await sendAppNotification({
      appRequestId: "request-123",
      eventKey: "PUBLISH_SUCCEEDED",
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Campus Forms is now live",
        html: expect.stringContaining(
          'href="https://campus-forms.azurewebsites.net"',
        ),
      }),
    );
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/features/notifications/service.test.ts`
Expected: The three new tests FAIL (generic subject, no `findUnique` call). Pre-existing tests still PASS.

- [ ] **Step 3: Rewire the service**

In `src/features/notifications/service.ts`:

1. Add the import and remove the now-unused helper:
   - Add: `import { renderAppEventEmail } from "./templates";`
   - Delete the whole `buildMessage` function (lines 97–119). Leave `escapeHtml` and `buildDeletedAppMessage` in place — `buildDeletedAppMessage` still uses `escapeHtml`, and Task 4 deletes both together.

2. Widen the select inside `sendAppNotification` — replace:

```typescript
    select: {
      id: true,
      appName: true,
```

with:

```typescript
    select: {
      id: true,
      appName: true,
      supportReference: true,
      repositoryName: true,
      repositoryUrl: true,
      publishUrl: true,
      publishErrorSummary: true,
      publishingSetupErrorSummary: true,
```

3. Replace the message construction — replace:

```typescript
  const message = buildMessage({
    appName: appRequest.appName,
    appRequestId: appRequest.id,
    appUrl,
    eventKey,
  });
```

with:

```typescript
  const actor = actorUserId
    ? await prisma.user.findUnique({
        where: { id: actorUserId },
        select: { displayName: true },
      })
    : null;
  const portalUrl = appUrl.replace(/\/$/, "");
  const baseContext = {
    eventKey,
    appName: appRequest.appName,
    portalUrl,
    appHref: `${portalUrl}/download/${appRequest.id}`,
    actorDisplayName: actor?.displayName ?? null,
    publishUrl: appRequest.publishUrl,
    publishErrorSummary: appRequest.publishErrorSummary,
    publishingSetupErrorSummary: appRequest.publishingSetupErrorSummary,
    repositoryName: appRequest.repositoryName,
    repositoryUrl: appRequest.repositoryUrl,
    supportReference: appRequest.supportReference,
  };
```

4. Inside the recipient loop, right after the preference-skip `continue` block (before `let result;`), add:

```typescript
    const message = renderAppEventEmail({
      ...baseContext,
      recipientDisplayName: recipient.displayName,
    });
```

(The `mailer.send` call below it already reads `message.subject/text/html` and needs no change.)

- [ ] **Step 4: Run the notification test suite**

Run: `npx vitest run src/features/notifications`
Expected: PASS — all files, including the pre-existing escape/link assertions (the CTA button preserves `href="https://portal.example.edu/download/request-123"`).

- [ ] **Step 5: Commit**

```bash
git add src/features/notifications/service.ts src/features/notifications/service.test.ts
git commit -m "feat: send branded event-specific emails from app notifications"
```

---

### Task 4: Deleted-app snapshot path + full verification

**Files:**
- Modify: `src/features/notifications/service.ts` (replace `buildDeletedAppMessage` usage)
- Test: `src/features/notifications/service.test.ts`

**Interfaces:**
- Consumes: `renderAppEventEmail` (Task 1/2); `sendDeletedAppNotificationSnapshot` keeps its exact public signature.
- Produces: deleted-app emails use the branded APP_DELETED template with `appHref: null` and an actor lookup.

- [ ] **Step 1: Add failing tests**

Append inside `describe("sendDeletedAppNotificationSnapshot", ...)` in `service.test.ts`. Note this describe's `beforeEach` only calls `vi.clearAllMocks()` — add the same `findUnique` default there:

```typescript
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
  });
```

Then add:

```typescript
  it("sends the branded deletion email naming the actor", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      displayName: "Owner User",
    } as never);
    const mailer = { send: vi.fn().mockResolvedValue({ provider: "smtp" }) };

    await sendDeletedAppNotificationSnapshot({
      appRequestId: "request-deleted",
      appName: "Campus Forms",
      actorUserId: "owner-123",
      recipients: [
        {
          id: "collab-123",
          email: "collab@cedarville.edu",
          displayName: "Collaborator User",
          notificationPreference: null,
        },
      ],
      mailer,
      appUrl: "https://portal.example.edu",
    });

    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "App deleted: Campus Forms",
        html: expect.stringContaining("Hi Collaborator User,"),
        text: expect.stringContaining(
          "Campus Forms has been deleted from the Cedarville App Portal by Owner User.",
        ),
      }),
    );
    expect(mailer.send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("View app in portal"),
      }),
    );
  });
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npx vitest run src/features/notifications/service.test.ts`
Expected: New test FAILS (old subject `App Portal update: Campus Forms`).

- [ ] **Step 3: Replace the deleted-app message construction**

In `src/features/notifications/service.ts`:

1. Delete the whole `buildDeletedAppMessage` function and the now-unused `escapeHtml` function.
2. In `sendDeletedAppNotificationSnapshot`, replace:

```typescript
  const message = buildDeletedAppMessage({ appName });
```

with:

```typescript
  const actor = actorUserId
    ? await prisma.user.findUnique({
        where: { id: actorUserId },
        select: { displayName: true },
      })
    : null;
  const baseContext = {
    eventKey,
    appName,
    portalUrl: appUrl,
    appHref: null,
    actorDisplayName: actor?.displayName ?? null,
  };
```

3. Inside the snapshot recipient loop, right before `let result;`, add:

```typescript
    const message = renderAppEventEmail({
      ...baseContext,
      recipientDisplayName: recipient.displayName,
    });
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS. The pre-existing deletion tests pass because the copy keeps "The app details page is no longer available in the portal." and renders no `/download/request-deleted` link.

- [ ] **Step 5: Run the production build gate**

Run: `npm run build`
Expected: Build completes with no type errors in `src/features/notifications/`.

- [ ] **Step 6: Commit**

```bash
git add src/features/notifications/service.ts src/features/notifications/service.test.ts
git commit -m "feat: branded deletion emails from app snapshot notifications"
```
