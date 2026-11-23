"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const destinations = [
  { href: "/", label: "Home" },
  { href: "/apps", label: "My Apps" },
  { href: "/apps/public", label: "Cedarville Apps" },
  { href: "/help", label: "Help" },
  { href: "/admin", label: "Admin" },
];

export function SiteNavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? destinations : destinations.slice(0, -1);
  const section = pathname?.startsWith("/download/")
    ? "/apps"
    : links.findLast(({ href }) => pathname === href || pathname?.startsWith(href + "/"))?.href;

  return (
    <nav className="site-header__nav" aria-label="Primary navigation">
      <div className="site-header__nav-links">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : section === href ? "location" : undefined}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
