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
