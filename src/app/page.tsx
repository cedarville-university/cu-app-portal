import type { Metadata } from "next";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { CuLaunchBrand } from "@/components/cu-launch-brand";
import { WhatsChanged } from "@/features/release-notes/whats-changed";
import { LaunchRocketIcon } from "@/components/launch-rocket-icon";

export const metadata: Metadata = { title: { absolute: "Home | CU Launch" } };

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

      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works">How it works</h2>
        <ol className="home-steps">
          <li>
            <h3>Start with an app</h3>
            <p>Choose a Cedarville-approved template or bring an app you already have.</p>
          </li>
          <li>
            <h3>Save your code</h3>
            <p>CU Launch sets up a private home for your code on GitHub. You can use Codex to make changes.</p>
          </li>
          <li>
            <h3>Publish when ready</h3>
            <p>Start publishing from CU Launch, then come back to check progress and open your live app.</p>
          </li>
        </ol>
      </section>
      <WhatsChanged />
    </main>
  );
}
