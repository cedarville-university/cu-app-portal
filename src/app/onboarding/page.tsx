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
        <section className="form-stack" aria-labelledby="github-account-heading">
          <h2 id="github-account-heading">Do you already have a GitHub account?</h2>
          <p className="muted">
            GitHub stores your app&rsquo;s code. The portal can create the repository
            either way; an account lets Codex work with the code later.
          </p>
          <div className="grid grid--2">
            <Link className="card card--interactive card--navy-border wizard-choice" href="/create">
              <span className="card__title">Yes, I have one</span>
              <span className="card__desc">Choose a template. We&rsquo;ll ask for your GitHub username after the app is created.</span>
            </Link>
            <Link className="card card--interactive card--gold-border wizard-choice" href="/create">
              <span className="card__title">Not yet</span>
              <span className="card__desc">You can still create your app now. We&rsquo;ll show you how to create a free account before you need repository access.</span>
            </Link>
          </div>
        </section>
      ) : selectedPath === "existing" ? (
        <section className="form-stack" aria-labelledby="existing-github-heading">
          <h2 id="existing-github-heading">Great — we&rsquo;ll start with your repository</h2>
          <p className="muted">
            You&rsquo;ll paste its GitHub web address next. The portal checks whether it can prepare the app for Azure and copies it into the managed Cedarville organization when needed.
          </p>
          <div><Link href="/apps/add" className="btn btn--primary-solid">Continue to repository check</Link></div>
        </section>
      ) : (
        <section className="form-stack" aria-labelledby="local-app-heading">
          <h2 id="local-app-heading">Your local app needs a home on GitHub</h2>
          <p className="muted">
            The portal will make an empty managed repository. Next, it gives you a Codex-ready prompt that safely connects and pushes the app from your computer.
          </p>
          <div><Link href="/apps/add#local-app" className="btn btn--primary-solid">Create a managed repository</Link></div>
        </section>
      )}

      <p className="wizard-back"><Link href="/onboarding">Choose a different starting point</Link></p>
    </main>
  );
}
