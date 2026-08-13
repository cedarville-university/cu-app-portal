import React from "react";
import Link from "next/link";
import { loginAction } from "@/features/auth/login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const redirectTo = callbackUrl ?? "/";

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-card__brand" aria-hidden="true">
          <span className="login-card__monogram">CU</span>
          <span>Cedarville University</span>
        </div>
        <div className="login-card__content">
          <p className="login-card__eyebrow">Welcome to</p>
          <h1 id="login-title">CU App Portal</h1>
          <p className="login-card__description">
            Sign in with your Cedarville account to create, publish, and manage
            your apps.
          </p>
          <form action={loginAction}>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button type="submit" className="btn btn--primary-solid btn--full">
              Sign in with Microsoft Entra
            </button>
          </form>
          <Link href="/" className="btn btn--ghost btn--full">
            Cancel and return home
          </Link>
        </div>
        <p className="login-card__help">
          Use your <strong>@cedarville.edu</strong> account.
        </p>
      </section>
    </main>
  );
}
