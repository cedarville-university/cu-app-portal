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
