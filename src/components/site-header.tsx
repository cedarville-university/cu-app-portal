import React from "react";
import Link from "next/link";
import { LoginButton } from "@/features/auth/login-button";
import { LogoutButton } from "@/features/auth/logout-button";
import { getServerSession } from "@/auth/session";
import { userHasAdminRole } from "@/features/app-requests/access";

export async function SiteHeader() {
  const session = await getServerSession();
  const userDisplayName = session?.user?.name ?? session?.user?.email;
  const isAdmin = session?.user?.id
    ? await userHasAdminRole(session.user.id)
    : false;

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
          <Link href="/apps/public">Public Apps</Link>
          <Link href="/help">Help</Link>
          {isAdmin ? <Link href="/admin">Admin</Link> : null}
          {session?.user ? (
            <details className="site-header__account-menu">
              <summary className="site-header__user-name">
                {userDisplayName ?? "Account"}
              </summary>
              <div className="site-header__account-menu-content">
                <Link href="/settings">Settings</Link>
                <LogoutButton />
              </div>
            </details>
          ) : null}
          {session?.user ? null : <LoginButton />}
        </nav>
      </div>
    </header>
  );
}
