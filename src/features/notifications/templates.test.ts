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
