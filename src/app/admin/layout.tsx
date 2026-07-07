import Link from "next/link";
import React from "react";
import { AdminNav } from "@/features/admin/admin-nav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page">Admin</span>
      </nav>
      <AdminNav />
      {children}
    </main>
  );
}
