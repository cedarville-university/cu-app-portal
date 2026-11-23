import React from "react";
import Link from "next/link";
import { LoginButton } from "@/features/auth/login-button";
import { getServerSession } from "@/auth/session";
import { userHasAdminRole } from "@/features/app-requests/access";
import { AccountMenu } from "./account-menu";
import { CuLaunchBrand } from "./cu-launch-brand";
import { SiteNavLinks } from "./site-nav-links";

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
          <CuLaunchBrand compact surface="dark" />
        </Link>

        <SiteNavLinks isAdmin={isAdmin} />
        <div className="site-header__account">
          {session?.user ? (
            <AccountMenu userDisplayName={userDisplayName ?? "Account"} />
          ) : <LoginButton />}
        </div>
      </div>
    </header>
  );
}
