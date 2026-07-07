"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const TABS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/users", label: "Users", exact: false },
  { href: "/admin/apps", label: "Apps", exact: false },
  { href: "/admin/events", label: "Events", exact: false },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      style={{
        display: "flex",
        gap: "0.5rem",
        flexWrap: "wrap",
        marginBottom: "1.5rem",
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`btn btn--sm ${isActive ? "btn--secondary-solid" : "btn--ghost"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
