import { describe, expect, it } from "vitest";
import { loadSmtpConfig } from "./config";
import { createSmtpMailer } from "./mailer";

describe("SMTP notification mailer", () => {
  it("loads SMTP config from environment values", () => {
    expect(
      loadSmtpConfig({
        PORTAL_APP_URL: "https://portal.example.edu",
        SMTP_HOST: "smtp.example.edu",
        SMTP_PORT: "587",
        SMTP_USERNAME: "portal",
        SMTP_PASSWORD: "secret",
        SMTP_TLS_MODE: "starttls",
        SMTP_FROM: "App Portal <portal@example.edu>",
        SMTP_REPLY_TO: "support@example.edu",
      }),
    ).toEqual({
      appUrl: "https://portal.example.edu",
      host: "smtp.example.edu",
      port: 587,
      username: "portal",
      password: "secret",
      tlsMode: "starttls",
      from: "App Portal <portal@example.edu>",
      replyTo: "support@example.edu",
    });
  });

  it("rejects invalid TLS mode", () => {
    expect(() =>
      loadSmtpConfig({
        PORTAL_APP_URL: "https://portal.example.edu",
        SMTP_HOST: "smtp.example.edu",
        SMTP_PORT: "587",
        SMTP_TLS_MODE: "sometimes",
        SMTP_FROM: "portal@example.edu",
      }),
    ).toThrow();
  });

  it("wraps a transport and returns provider message id", async () => {
    const messages: unknown[] = [];
    const mailer = createSmtpMailer({
      config: {
        appUrl: "https://portal.example.edu",
        host: "smtp.example.edu",
        port: 587,
        tlsMode: "starttls",
        from: "portal@example.edu",
      },
      transport: {
        async sendMail(message) {
          messages.push(message);
          return { messageId: "smtp-123" };
        },
      },
    });

    await expect(
      mailer.send({
        to: "staff@cedarville.edu",
        subject: "Portal update",
        text: "Text body",
        html: "<p>Text body</p>",
      }),
    ).resolves.toEqual({ provider: "smtp", providerMessageId: "smtp-123" });
    expect(messages).toHaveLength(1);
  });
});
