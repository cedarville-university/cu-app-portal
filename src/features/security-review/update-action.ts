"use server";

import { userHasAdminRole } from "../app-requests/access";
import { getCurrentUserIdOrNull } from "../app-requests/current-user";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { enrolledRepository, updateClient } from "./update-service";

export async function applySecurityUpdate(requestId: string, number: number, head: string, base: string) {
  const denied = { applied: false, message: "Only an app owner or administrator can apply a security update for an enrolled app." };
  const actor = await getCurrentUserIdOrNull();
  if (!actor || !Number.isSafeInteger(number) || number < 1 || ![head, base].every(s => /^[0-9a-f]{40}$/.test(s))) return denied;
  const isAdmin = await userHasAdminRole(actor);
  const app = await prisma.appRequest.findFirst({
    where: { id: requestId, ...(isAdmin ? {} : { userId: actor }) },
    select: { repositoryOwner: true, repositoryName: true, repositoryUrl: true, repositoryStatus: true, deploymentTriggerMode: true },
  });
  const repo = app && enrolledRepository(app);
  if (!app || !repo) return denied;
  try {
    const applied = await updateClient(repo.owner).applyUpdate(repo, number, head, base);
    if (!applied) return { applied, message: "GitHub hasn’t cleared this version to apply. Refresh the review for the latest checks and changes." };
  } catch {
    return { applied: false, message: "CU Launch couldn’t confirm the update with GitHub. Refresh the review before trying again." };
  }
  await recordAuditEvent("SECURITY_UPDATE_APPLIED", { actorUserId: actor, requestId, repository: app.repositoryUrl, pullRequest: number, head });
  return { applied: true, message: app.deploymentTriggerMode === "PUSH_TO_DEPLOY"
    ? "Update applied. Automatic publishing can now start. See Deployment for progress."
    : "Update applied. Publish the app when you’re ready." };
}
