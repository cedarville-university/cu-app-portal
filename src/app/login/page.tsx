import React from "react";
import Link from "next/link";
import { loginAction } from "@/features/auth/login";
import { CuLaunchBrand } from "@/components/cu-launch-brand";

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
        <div className="login-card__content">
          <p className="login-card__eyebrow">Welcome to</p>
          <h1 id="login-title"><CuLaunchBrand /></h1>
          <p className="login-card__description">
            Sign in with your Cedarville account to launch, publish, and manage
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
