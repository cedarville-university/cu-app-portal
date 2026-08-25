import React from "react";
import type { PortalTemplate } from "@/features/templates/types";
import { AudienceField } from "./audience-field";

function renderDatabaseField(template: PortalTemplate) {
  if (template.features.database.mode === "unsupported") {
    return (
      <input
        key="databaseProvider"
        name="databaseProvider"
        type="hidden"
        value="none"
      />
    );
  }

  if (template.features.database.mode === "required") {
    return (
      <input
        key="databaseProvider"
        name="databaseProvider"
        type="hidden"
        value="postgresql"
      />
    );
  }

  return (
    <fieldset key="databaseProvider" className="form-group">
      <legend className="form-label">Database</legend>
      <label className="choice-row">
        <input
          type="radio"
          name="databaseProvider"
          value="postgresql"
          defaultChecked={template.features.database.defaultProvider === "postgresql"}
        />
        <span>PostgreSQL</span>
      </label>
      <label className="choice-row">
        <input
          type="radio"
          name="databaseProvider"
          value="none"
          defaultChecked={template.features.database.defaultProvider === "none"}
        />
        <span>No database</span>
      </label>
    </fieldset>
  );
}

export function TemplateFormFields({ template }: { template: PortalTemplate }) {
  return (
    <>
      {template.fields.map((field) => {
        switch (field.type) {
          case "text":
            return (
              <div key={field.name} className="form-group">
                <label className="form-label" htmlFor={field.name}>
                  {field.label}
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="text"
                  required={field.required}
                  className="form-control"
                />
              </div>
            );
          case "textarea":
            return (
              <div key={field.name} className="form-group">
                <label className="form-label" htmlFor={field.name}>
                  {field.label}
                </label>
                <textarea
                  id={field.name}
                  name={field.name}
                  required={field.required}
                  className="form-control"
                />
              </div>
            );
          case "select":
            if (field.options.length === 1) {
              return (
                <input
                  key={field.name}
                  name={field.name}
                  type="hidden"
                  value={field.options[0]}
                />
              );
            }

            return (
              <div key={field.name} className="form-group">
                <label className="form-label" htmlFor={field.name}>
                  {field.label}
                </label>
                <select
                  id={field.name}
                  name={field.name}
                  required={field.required}
                  className="form-control"
                >
                  <option value="">Select an option</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            );
          default:
            throw new Error("Unsupported template field type.");
        }
      })}
      {renderDatabaseField(template)}
      <AudienceField />
    </>
  );
}
