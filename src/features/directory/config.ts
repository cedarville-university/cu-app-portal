import { z } from "zod";

const directoryConfigSchema = z.object({
  ENTRA_DIRECTORY_TENANT_ID: z.string().min(1),
  ENTRA_DIRECTORY_CLIENT_ID: z.string().min(1),
  ENTRA_DIRECTORY_CLIENT_SECRET: z.string().min(1),
  ENTRA_ALLOWED_EMAIL_DOMAIN: z.string().min(1).default("cedarville.edu"),
});

export type DirectoryConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  allowedEmailDomain: string;
};

export function loadDirectoryConfig(
  source: Record<string, string | undefined> = process.env,
): DirectoryConfig {
  const parsed = directoryConfigSchema.parse(source);

  return {
    tenantId: parsed.ENTRA_DIRECTORY_TENANT_ID,
    clientId: parsed.ENTRA_DIRECTORY_CLIENT_ID,
    clientSecret: parsed.ENTRA_DIRECTORY_CLIENT_SECRET,
    allowedEmailDomain: parsed.ENTRA_ALLOWED_EMAIL_DOMAIN,
  };
}
