import type { Metadata } from "next";
import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { getSafePortalReturnTo } from "@/features/auth/return-to";
import { GitHubProfileForm } from "@/features/onboarding/github-profile-form";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Your GitHub Account" };

export default async function GitHubProfilePage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const returnTo = getSafePortalReturnTo((await searchParams).returnTo);
  const userId = await getCurrentUserIdOrNull();
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { githubUsername: true } });
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
  if (user.githubUsername?.trim()) redirect(returnTo);

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="github-profile-title">
        <div className="login-card__content github-profile-step">
          <h1 id="github-profile-title">What&apos;s your GitHub username?</h1>
          <p className="login-card__description">
            CU Launch uses GitHub to store your app&apos;s code. Save your username
            so we can invite you when you need access. We&apos;ll remember it for
            future apps.
          </p>
          <GitHubProfileForm returnTo={returnTo} />
          <Link href={returnTo} className="btn btn--ghost btn--full">Skip for now</Link>
          <div className="github-profile-help">
            <h2>Don&apos;t know your username?</h2>
            <p>
              Sign in to GitHub, or create an account if you don&apos;t have one.
              Open your profile: your username appears after github.com/ in its
              address. Return to this tab and enter it above.
            </p>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="btn btn--secondary btn--full">
              Open GitHub (new tab)
            </a>
          </div>
        </div>
        <p className="login-card__help">You can also add your GitHub username later in Settings.</p>
      </section>
    </main>
  );
}
