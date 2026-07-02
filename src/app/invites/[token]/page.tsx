import React from "react";
import { getServerSession, signIn } from "@/auth/session";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { acceptInviteFormAction } from "./actions";

type FormAction = (formData: FormData) => void | Promise<void>;

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
        redirectTo: `/invites/${encodeURIComponent(token)}`,
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

  const acceptAction = acceptInviteFormAction.bind(
    null,
    token,
  ) as unknown as FormAction;

  return (
    <main>
      <section className="card">
        <h1>Accept Collaboration Invite</h1>
        <p>Accept this collaboration invite to view the app.</p>
        <form action={acceptAction}>
          <PendingSubmitButton
            idleLabel="Accept Invite"
            pendingLabel="Accepting Invite..."
            statusText="Accepting collaboration invite."
            variant="primary-solid"
          />
        </form>
      </section>
    </main>
  );
}
