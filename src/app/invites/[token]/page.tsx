import React from "react";
import { redirect } from "next/navigation";
import { getServerSession, signIn } from "@/auth/session";
import { acceptCollaborationInviteAction } from "@/features/collaboration-invites/actions";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getServerSession();

  if (!session?.user) {
    async function signInAction() {
      "use server";
      await signIn("microsoft-entra-id", {
        redirectTo: `/invites/${token}`,
      });
    }

    return (
      <main>
        <section className="card">
          <h1>Accept Collaboration Invite</h1>
          <p>Sign in to accept this collaboration invite.</p>
          <form action={signInAction}>
            <PendingSubmitButton
              idleLabel="Sign In"
              pendingLabel="Signing In..."
              statusText="Redirecting to Cedarville sign-in."
              variant="primary-solid"
            />
          </form>
        </section>
      </main>
    );
  }

  const appRequestId = await acceptCollaborationInviteAction(token);

  redirect(`/download/${appRequestId}`);
}
