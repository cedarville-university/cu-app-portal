import type { Metadata } from "next";
import React from "react";
import Link from "next/link";
import { HelpDocumentContent } from "@/features/help/help-document";
import { getHelpDocument } from "@/features/help/docs";

const sections = [
  {
    href: "/help/guide",
    title: "Complete User Guide",
    description: "Launch, add, customize, publish, share, repair, download, and delete apps.",
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

export const metadata: Metadata = { title: "Help" };

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
          <h1>CU Launch Help Center</h1>
          <p>Start with Quick Start or <a href="#help-topics">browse help topics</a>.</p>
        </div>
        <div className="help-downloads" aria-label="Documentation downloads">
          <a className="btn btn--primary-solid btn--sm" href="/docs/cu-launch-quick-start.pdf" download>
            Download Quick Start PDF
          </a>
          <a className="btn btn--ghost btn--sm" href="/docs/cu-launch-user-guide.pdf" download>
            Download Full Guide PDF
          </a>
        </div>
      </div>

      <HelpDocumentContent document={quickStart} embedded />

      <nav id="help-topics" tabIndex={-1} className="help-topics" aria-labelledby="help-topics-heading">
        <h2 id="help-topics-heading">Help topics</h2>
        <ul className="help-section-nav">
          {sections.map((section) => (
            <li key={section.href}>
              <Link href={section.href}>{section.title}</Link>
              <p>{section.description}</p>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
