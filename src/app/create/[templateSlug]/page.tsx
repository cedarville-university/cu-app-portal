import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TemplateForm } from "@/features/create-app/template-form";
import { getActiveTemplateBySlug } from "@/features/templates/catalog";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ templateSlug: string }>;
}) {
  const { templateSlug } = await params;
  const template = getActiveTemplateBySlug(templateSlug);

  if (!template) {
    notFound();
  }

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">/</span>
        <Link href="/create">Create New App</Link>
        <span className="breadcrumb__sep" aria-hidden="true">/</span>
        <span aria-current="page">{template.name}</span>
      </nav>

      <div className="page-header">
        <h1>{template.name}</h1>
        <p>{template.description}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem", maxWidth: "640px" }}>
        <section aria-label="Template summary">
          <p className="card__desc">{template.decisionSummary}</p>
          <ul className="template-best-for">
            {template.bestFor.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <span className="badge badge--default">Database: {template.features.database.mode}</span>
            <span className="badge badge--default">Access: Choose sign-in or public</span>
          </div>
        </section>

        <div className="info-box">
          You can create the starter now. If you choose to customize it later,
          the portal will guide you through the account and access steps.
        </div>

        <div className="card">
          <TemplateForm template={template} />
        </div>
      </div>
    </main>
  );
}
