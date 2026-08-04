import React from "react";
import Link from "next/link";
import { HelpDocumentContent } from "@/features/help/help-document";
import { getHelpDocument } from "@/features/help/docs";

const sections = [
  {
    href: "/help/guide",
    title: "Complete User Guide",
    description: "Create, add, customize, publish, share, repair, download, and delete apps.",
  },
  {
    href: "/help/troubleshooting",
    title: "Troubleshooting",
    description: "Find the message you see and follow a safe, symptom-based recovery path.",
  },
  {
    href: "/help/faq",
    title: "Frequently Asked Questions",
    description: "Plain-language answers about GitHub, Azure, access, publishing, and deletion.",
  },
  {
    href: "/help/glossary",
    title: "Glossary",
    description: "Definitions for the technical terms used throughout the portal.",
  },
];

export default async function HelpPage() {
  const quickStart = await getHelpDocument("quick-start");

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">/</span>
        <span aria-current="page">Help</span>
      </nav>

      <div className="page-header help-header">
        <div>
          <h1>Help Center</h1>
          <p>Start here for your first app, then use the detailed guides when you need them.</p>
        </div>
        <div className="help-downloads" aria-label="Documentation downloads">
          <a className="btn btn--primary-solid btn--sm" href="/docs/cedarville-app-portal-quick-start.pdf" download>
            Download Quick Start PDF
          </a>
          <a className="btn btn--ghost btn--sm" href="/docs/cedarville-app-portal-user-guide.pdf" download>
            Download Full Guide PDF
          </a>
        </div>
      </div>

      <nav className="help-section-nav" aria-label="Help topics">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="card card--interactive card--navy-border">
            <span className="card__title">{section.title}</span>
            <span className="card__desc">{section.description}</span>
          </Link>
        ))}
      </nav>

      <HelpDocumentContent document={quickStart} />
    </main>
  );
}

