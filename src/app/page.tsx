import React from "react";
import Link from "next/link";
import { CuLaunchBrand } from "@/components/cu-launch-brand";

export default function HomePage() {
  return (
    <main>
      <div className="hero">
        <h1><CuLaunchBrand surface="dark" /></h1>
        <p>
          Launch an app, keep its code in a private online home, and publish it
          online — all from one place.
        </p>
        <div className="hero__actions">
          <Link href="/onboarding?start=new" className="btn btn--secondary-solid btn--lg">
            Launch New App
          </Link>
          <Link
            href="/onboarding?start=existing"
            className="btn btn--ghost btn--lg hero__secondary-action"
          >
            Add Existing App
          </Link>
          <Link
            href="/apps"
            className="btn btn--ghost btn--lg hero__secondary-action"
          >
            My Apps
          </Link>
        </div>
      </div>

      <p className="section-title">How it works</p>
      <div className="grid grid--3">
        <div className="card card--navy-border">
          <p style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>🛠️</p>
          <div className="card__title">Generate</div>
          <p className="card__desc">
            Pick a Cedarville-approved template, fill in your project details,
            and the portal generates a ready-to-use app package in seconds.
          </p>
        </div>
        <div className="card card--gold-border">
          <p style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>📦</p>
          <div className="card__title">Keep your work safe</div>
          <p className="card__desc">
            The portal sets up a private online home for your app&rsquo;s code.
            When you are ready, Codex can help you customize the app and save
            your changes there.
          </p>
        </div>
        <div className="card card--navy-border">
          <p style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>🚀</p>
          <div className="card__title">Publish</div>
          <p className="card__desc">
            Put your app online directly from this portal. Return here to
            start and monitor publishing.
          </p>
        </div>
      </div>
    </main>
  );
}
