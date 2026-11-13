import { PortalApiError } from "@/features/portal-api/errors";
import type { PortalActor } from "@/features/portal-api/principal";
import { githubUsernameSchema } from "@/features/repositories/access";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

export async function getMyProfile(actor: PortalActor) {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { displayName: true, email: true, githubUsername: true },
  });
  if (!user) {
    throw new PortalApiError("AUTHENTICATION_REQUIRED", "Sign in to CU Launch again.");
  }
  return { displayName: user.displayName, email: user.email, githubUsername: user.githubUsername };
}

export async function setMyGitHubUsername(actor: PortalActor, value: string) {
  const parsed = githubUsernameSchema.safeParse(value);
  if (!parsed.success) {
    throw new PortalApiError("INVALID_INPUT", "Enter a valid GitHub username.");
  }
  const githubUsername = parsed.data.toLowerCase();
  try {
    await prisma.user.update({
      where: { id: actor.userId },
      data: { githubUsername },
      select: { githubUsername: true },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      throw new PortalApiError("AUTHENTICATION_REQUIRED", "Sign in to CU Launch again.");
    }
    throw error;
  }
  await recordAuditEvent("USER_PROFILE_UPDATED", {
    actorUserId: actor.userId, githubUsername, source: "codex-mcp", operation: "set_my_github_username",
  });
  return { githubUsername };
}
