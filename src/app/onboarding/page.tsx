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

    </main>
  );
}
