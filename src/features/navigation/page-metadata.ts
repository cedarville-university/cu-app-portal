import type { Metadata } from "next";
import { getAdminUserIdOrNull } from "@/features/admin/guard";
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

type AppPageContext = "details" | "setup" | "admin";

export async function getAppPageMetadata(
  requestId: string,
  context: AppPageContext,
): Promise<Metadata> {
  const fallback = { details: "App Details", setup: "App Setup", admin: "Admin App" }[context];
  const userId = context === "admin"
    ? await getAdminUserIdOrNull()
    : await getCurrentUserIdOrNull();
  if (!userId) return { title: fallback };

  const isAdmin = context === "admin" || await userHasAdminRole(userId);
  const app = await prisma.appRequest.findFirst({
    where: appAccessWhere(requestId, userId, isAdmin),
    select: { appName: true },
  });
  if (!app) return { title: fallback };

  const suffix = { details: "", setup: " · Setup", admin: " · Admin" }[context];
  return { title: `${app.appName}${suffix}` };
}
