import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpDocumentContent } from "@/features/help/help-document";
import {
  getHelpDocument,
  helpDocumentSlugs,
  isHelpDocumentSlug,
} from "@/features/help/docs";

export function generateStaticParams() {
  return helpDocumentSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isHelpDocumentSlug(slug)) {
    return {};
  }
  const document = await getHelpDocument(slug);
  return {
    title: `${document.title} | Cedarville App Portal`,
    description: document.description,
  };
}

export default async function HelpDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isHelpDocumentSlug(slug)) {
    notFound();
  }

  const document = await getHelpDocument(slug);

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">/</span>
        <Link href="/help">Help</Link>
        <span className="breadcrumb__sep" aria-hidden="true">/</span>
        <span aria-current="page">{document.title}</span>
      </nav>

      <div className="help-page-actions">
        <Link href="/help" className="btn btn--ghost btn--sm">All Help Topics</Link>
        {slug === "quick-start" ? (
          <a className="btn btn--primary-solid btn--sm" href="/docs/cedarville-app-portal-quick-start.pdf" download>
            Download PDF
          </a>
        ) : (
          <a className="btn btn--primary-solid btn--sm" href="/docs/cedarville-app-portal-user-guide.pdf" download>
            Download Full Guide PDF
          </a>
        )}
      </div>

      <HelpDocumentContent document={document} />
    </main>
  );
}

