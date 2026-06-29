import { z } from "zod";

const smtpConfigSchema = z.object({
  PORTAL_APP_URL: z.string().url(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USERNAME: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_TLS_MODE: z.enum(["none", "starttls", "ssl"]).default("starttls"),
  SMTP_FROM: z.string().min(1),
  SMTP_REPLY_TO: z.string().min(1).optional(),
});

export type SmtpConfig = {
  appUrl: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  tlsMode: "none" | "starttls" | "ssl";
  from: string;
  replyTo?: string;
};

export function loadSmtpConfig(
  source: Record<string, string | undefined> = process.env,
): SmtpConfig {
  const parsed = smtpConfigSchema.parse(source);

  return {
    appUrl: parsed.PORTAL_APP_URL,
    host: parsed.SMTP_HOST,
    port: parsed.SMTP_PORT,
    username: parsed.SMTP_USERNAME,
    password: parsed.SMTP_PASSWORD,
    tlsMode: parsed.SMTP_TLS_MODE,
    from: parsed.SMTP_FROM,
    replyTo: parsed.SMTP_REPLY_TO,
  };
}
