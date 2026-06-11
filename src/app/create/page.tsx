import React from "react";
import Link from "next/link";
import { getActiveTemplates } from "@/features/templates/catalog";
import type { PortalTemplate } from "@/features/templates/types";

function getLoginLabel(template: PortalTemplate) {
  return template.features.entraLogin.mode === "unsupported"
    ? "No Entra"
    : "Entra available";
}

export default async function CreatePage() {
  const templates = getActiveTemplates();

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">/</span>
        <span aria-current="page">Create New App</span>
      </nav>

      <div className="page-header">
        <h1>Create New App</h1>
        <p>Choose a template to generate your Cedarville-approved app package.</p>
      </div>

      <details
        className="card"
        style={{
          maxWidth: "760px",
          marginBottom: "1.25rem",
          padding: "1rem 1.125rem",
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          What is GitHub?
        </summary>
        <div
          style={{
            marginTop: "0.75rem",
            color: "var(--text-secondary)",
            fontSize: "0.9375rem",
          }}
        >
          <p>
            GitHub is a secure place to store app code, keep track of changes,
            and share work with the people and tools that need access.
          </p>
          <p style={{ marginTop: "0.625rem" }}>
            The portal uses GitHub so Codex, Cedarville reviewers, and Azure
            publishing can all work from the same managed repository instead of
            passing files around manually.
          </p>
        </div>
      </details>

      <div className="grid grid--2">
        {templates.map((template) => (
          <div key={template.id} className="card card--interactive card--navy-border">
            <div className="card__title">{template.name}</div>
            <p className="card__desc">{template.decisionSummary}</p>
            <p className="muted">{template.appServiceRuntime.displayName}</p>
            <ul className="template-best-for">
              {template.bestFor.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
              <span className="badge badge--default">Database: {template.features.database.mode}</span>
              <span className="badge badge--default">Login: {getLoginLabel(template)}</span>
            </div>
            <Link href={`/create/${template.slug}`} className="btn btn--primary-solid btn--sm">
              Use {template.name}
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
