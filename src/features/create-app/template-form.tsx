"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { createAppAction } from "@/app/create/actions";
import type { PortalTemplate } from "@/features/templates/types";
import { SubmitButton } from "./submit-button";
import { TemplateFormFields } from "./template-form-fields";

export function TemplateForm({ template }: { template: PortalTemplate }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (error && !pending) {
      formRef.current?.querySelector<HTMLInputElement>('[name="appName"]')?.focus();
    }
  }, [error, pending]);

  return (
    <form
      ref={formRef}
      onChange={(event) => {
        if (event.target instanceof HTMLInputElement && event.target.name === "appName") {
          setError("");
        }
      }}
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const form = event.currentTarget;
        const formData = new FormData(form);
        setError("");
        // Submit manually so React does not reset uncontrolled fields on a conflict.
        startTransition(async () => {
          const result = await createAppAction(formData);
          if (result?.error) {
            setError(result.error);
          }
        });
      }}
    >
      <input type="hidden" name="templateSlug" value={template.slug} />
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="form-stack">
        <TemplateFormFields template={template} />
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <SubmitButton pending={pending} />
      </div>
    </form>
  );
}
