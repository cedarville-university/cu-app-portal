import React from "react";
import Link from "next/link";

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
          We&rsquo;ll guide you from your starting point to a managed GitHub
          repository and Azure publishing. You can return to the full app
          details page whenever you need it later.
        </p>
      </div>

      <ol className="wizard-progress" aria-label="Onboarding progress">
        <li className="wizard-progress__active">Choose a starting point</li>
        <li>Set up your code repository</li>
        <li>Customize and publish</li>
      </ol>

      {!selectedPath ? (
        <section className="form-stack" aria-labelledby="starting-point-heading">
          <h2 id="starting-point-heading">Where is your app today?</h2>
          <div className="grid grid--3">
            <Link className="card card--interactive card--navy-border wizard-choice" href="/onboarding?start=new">
              <span className="wizard-choice__step">Option 1</span>
              <span className="card__title">I need a new app</span>
              <span className="card__desc">Start with a Cedarville-approved template. The portal creates the GitHub repository for you.</span>
            </Link>
            <Link className="card card--interactive card--gold-border wizard-choice" href="/onboarding?start=existing">
              <span className="wizard-choice__step">Option 2</span>
              <span className="card__title">My app is already on GitHub</span>
              <span className="card__desc">Bring an existing repository into the portal-managed publishing workflow.</span>
            </Link>
            <Link className="card card--interactive card--navy-border wizard-choice" href="/onboarding?start=local">
              <span className="wizard-choice__step">Option 3</span>
              <span className="card__title">My app is only on my computer</span>
              <span className="card__desc">Create an empty managed repository, then use Codex to connect and push your local app.</span>
            </Link>
          </div>
        </section>
      ) : selectedPath === "new" ? (
        <section className="form-stack" aria-labelledby="new-app-heading">
          <h2 id="new-app-heading">Choose a starting point</h2>
          <p className="muted">
            A template gives you a ready-to-customize starting version of an app.
            The portal will guide you through saving your work online after you
            choose one.
          </p>
          <div>
            <Link href="/create" className="btn btn--primary-solid">
              Choose an app template
            </Link>
          </div>
        </section>
      ) : selectedPath === "existing" ? (
        <section className="form-stack" aria-labelledby="existing-github-heading">
          <h2 id="existing-github-heading">Where is your app's code?</h2>
          <p className="muted">
            Choose the place where you can find the app right now. We&rsquo;ll show
            you the next step from there.
          </p>
          <div className="grid grid--2">
            <Link className="card card--interactive card--navy-border wizard-choice" href="/apps/add?source=github">
              <span className="card__title">Already on GitHub</span>
              <span className="card__desc">Paste the web address for the place where your app is saved online.</span>
            </Link>
            <Link className="card card--interactive card--gold-border wizard-choice" href="/apps/add?source=local#local-app">
              <span className="card__title">Only on my computer</span>
              <span className="card__desc">Create an online home for your app, then follow the steps to add your files.</span>
            </Link>
          </div>
        </section>
      ) : (
        <section className="form-stack" aria-labelledby="local-app-heading">
          <h2 id="local-app-heading">Your app needs an online home</h2>
          <p className="muted">
            The portal will create a private online space for your app. Next,
            it will give you a Codex-ready prompt to safely add the app from
            your computer.
          </p>
          <div><Link href="/apps/add?source=local#local-app" className="btn btn--primary-solid">Create an online home for my app</Link></div>
        </section>
      )}

      <p className="wizard-back"><Link href="/onboarding">Choose a different starting point</Link></p>
    </main>
  );
}
