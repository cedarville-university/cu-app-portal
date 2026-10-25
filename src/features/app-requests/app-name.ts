import { prisma } from "@/lib/db";

export const APP_NAME_CONFLICT_MESSAGE =
  "That app name is already in use. Please try another name.";

export async function isAppNameAvailable(
  appName: string,
  database: Pick<typeof prisma, "appRequest"> = prisma,
): Promise<boolean> {
  const name = appName.trim();
  if (!name) return false;

  // Both generated and imported apps already trim names before saving them.
  // Prisma's insensitive equality uses ILIKE, so escape pattern characters.
  const literalName = name.replace(/[\\%_]/g, "\\$&");
  const existing = await database.appRequest.findFirst({
    where: { appName: { equals: literalName, mode: "insensitive" } },
    select: { id: true },
  });
  return existing === null;
}

export function isAppNameUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") {
    return false;
  }
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) && target.includes("appNameKey");
}
