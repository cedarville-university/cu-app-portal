import nodemailer, { type Transporter } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type { SmtpConfig } from "./config";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailSendResult = {
  provider: "smtp";
  providerMessageId?: string;
};

export type Mailer = {
  send(message: MailMessage): Promise<MailSendResult>;
};

type SendMailTransport = Pick<Transporter, "sendMail">;

function createTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.tlsMode === "ssl",
    requireTLS: config.tlsMode === "starttls",
    auth:
      config.username && config.password
        ? { user: config.username, pass: config.password }
        : undefined,
  });
}

export function createSmtpMailer({
  config,
  transport = createTransport(config),
}: {
  config: SmtpConfig;
  transport?: SendMailTransport;
}): Mailer {
  return {
    async send(message) {
      const result = await transport.sendMail({
        from: config.from,
        replyTo: config.replyTo,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      } satisfies Mail.Options);

      return {
        provider: "smtp",
        providerMessageId:
          typeof result.messageId === "string" ? result.messageId : undefined,
      };
    },
  };
}
