import type { Metadata } from "next";
import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingProgress } from "@/features/onboarding/step-shell";

type StartPath = "new" | "existing" | "local" | null;

function getStartPath(value: string | string[] | undefined): StartPath {
  const start = Array.isArray(value) ? value[0] : value;

  return start === "new" || start === "existing" || start === "local"
    ? start
    : null;
}

export const metadata: Metadata = { title: "Launch Your App" };

export default async function OnboardingStartPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string | string[] }>;
}) {
  const { start } = await searchParams;
  const selectedPath = getStartPath(start);

  if (selectedPath === "new") redirect("/create");
  if (selectedPath === "existing") redirect("/apps/add?source=github");
  if (selectedPath === "local") redirect("/apps/add?source=local");

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">/</span>
        <span aria-current="page">Get started</span>
      </nav>

      <div className="page-header">
        <p className="eyebrow">App setup guide</p>
        <h1>Let&rsquo;s set up your app</h1>
        <p>
          We&rsquo;ll guide you from where you are today through saving your app
          online and sharing it when it&rsquo;s ready. You can return to the full
          app details page whenever you need it later.
        </p>
      </div>

      <OnboardingProgress currentStage="Start" />

      <section className="form-stack" aria-labelledby="starting-point-heading">
        <h2 id="starting-point-heading">Where is your app today?</h2>
        <div className="grid grid--3">
          <Link className="card card--interactive card--navy-border wizard-choice" href="/create">
            <span className="wizard-choice__step">Option 1</span>
            <span className="card__title">I need a new app</span>
            <span className="card__desc">Start with a Cedarville-approved template. The portal will set up a private online space for your app.</span>
          </Link>
          <Link className="card card--interactive card--gold-border wizard-choice" href="/apps/add?source=github">
            <span className="wizard-choice__step">Option 2</span>
            <span className="card__title">My app is already on GitHub</span>
            <span className="card__desc">Bring an app you have already saved online into the portal.</span>
          </Link>
          <Link className="card card--interactive card--navy-border wizard-choice" href="/apps/add?source=local">
            <span className="wizard-choice__step">Option 3</span>
            <span className="card__title">My app is only on my computer</span>
            <span className="card__desc">Create a private online space for your app, then follow simple steps to add the files from your computer.</span>
          </Link>
        </div>
      </section>

      <details className="onboarding-step-shell__support">
        <summary>Advanced</summary>
        <h2>Use CU Launch in Codex</h2>
        <p>
          Prefer to work directly in Codex? Install the CU Launch plugin to
          create and manage your Cedarville apps from a conversation.
        </p>
        <p>
          <a
            href="https://chatgpt.com/plugins/plugin_asdk_app_6aa05e6de3dc8191a45e1683ba5ee8e9?account_id=791c7de6-fe94-46ad-b7f7-ee335bbcdd6c"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the CU Launch plugin (opens in a new tab)
          </a>
        </p>
        <p>
          In Codex, open Plugins, find CU Launch, and install it while signed in
          to your Cedarville workspace. Then ask Codex to help you launch an app.
        </p>
      </details>
    </main>
  );
}
