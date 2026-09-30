import React from "react";
import Link from "next/link";
import Image from "next/image";
import { CuLaunchBrand } from "@/components/cu-launch-brand";
import { LaunchRocketIcon } from "@/components/launch-rocket-icon";

export default function HomePage() {
  return (
    <main>
      <div className="hero">
        <div className="hero__content">
          <h1><CuLaunchBrand surface="dark" /></h1>
          <p>
            Launch an app, keep its code in a private online home, and publish it
            online — all from one place.
          </p>
          <div className="hero__actions">
            <Link href="/onboarding" className="btn btn--secondary-solid btn--lg">
              <LaunchRocketIcon tone="dark" />
              Launch Your App
            </Link>
            <Link
              href="/apps"
              className="btn btn--ghost btn--lg hero__secondary-action"
            >
              My Apps
            </Link>
          </div>
        </div>
        <Image
          src="/brand/cu-launch-hero-art.png"
          alt=""
          aria-hidden="true"
          width={1448}
          height={1086}
          priority
          className="hero__art"
        />
      </div>

      <p className="section-title">How it works</p>
      <div className="grid grid--3">
        <div className="card card--navy-border">
          <p style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>🛠️</p>
          <div className="card__title">Generate</div>
          <p className="card__desc">
            Pick a Cedarville-approved template, fill in your project details,
            and CU Launch generates a ready-to-use app package in seconds.
          </p>
        </div>
        <div className="card card--gold-border">
          <p style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>📦</p>
          <div className="card__title">Keep your work safe</div>
          <p className="card__desc">
            CU Launch sets up a private online home for your app&rsquo;s code.
            When you are ready, Codex can help you customize the app and save
            your changes there.
          </p>
        </div>
        <div className="card card--navy-border">
          <p style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>🚀</p>
          <div className="card__title">Publish</div>
          <p className="card__desc">
            Put your app online directly from this portal. Return to CU Launch to
            start and monitor publishing.
          </p>
        </div>
      </div>
    </main>
  );
}
