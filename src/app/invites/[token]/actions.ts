"use server";

import { redirect } from "next/navigation";
import { acceptCollaborationInviteAction } from "@/features/collaboration-invites/actions";

export async function acceptInviteFormAction(token: string) {
  const appRequestId = await acceptCollaborationInviteAction(token);

  redirect(`/download/${appRequestId}`);
}
