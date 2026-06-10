import React from "react";
import Link from "next/link";
import { LoginButton } from "@/features/auth/login-button";
import { LogoutButton } from "@/features/auth/logout-button";
import { getServerSession } from "@/auth/session";

export async function SiteHeader() {
  const session = await getServerSession();
  const userDisplayName = session?.user?.name ?? session?.user?.email;

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          <div className="site-header__logo-mark">CU</div>
          <div>
            <span className="site-header__title">App Portal</span>
            <span className="site-header__subtitle">Cedarville University</span>
          </div>
        </Link>

        <nav className="site-header__nav" aria-label="Primary navigation">
          <Link href="/">Home</Link>
          <Link href="/create">Create App</Link>
          <Link href="/apps">My Apps</Link>
          {userDisplayName ? (
            <span className="site-header__user-name">{userDisplayName}</span>
          ) : null}
          {session?.user ? <LogoutButton /> : <LoginButton />}
        </nav>
      </div>
    </header>
  );
}
