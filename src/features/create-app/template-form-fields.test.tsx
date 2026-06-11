import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getActiveTemplateBySlug } from "@/features/templates/catalog";
import type { PortalTemplate } from "@/features/templates/types";
import { TemplateFormFields } from "./template-form-fields";

afterEach(() => {
  cleanup();
});

function buildTemplate(fields: PortalTemplate["fields"]): PortalTemplate {
  const template = getActiveTemplateBySlug("web-app");

  if (!template) {
    throw new Error("Missing active web-app template fixture");
  }

  return {
    ...template,
    fields,
  };
}

describe("TemplateFormFields", () => {
  it("submits a single select option without showing a visible choice", () => {
    const { container } = render(
      <TemplateFormFields
        template={buildTemplate([
          {
            name: "hostingTarget",
            label: "Hosting Target",
            type: "select",
            required: true,
            options: ["Azure App Service"],
          },
        ])}
      />,
    );

    expect(
      screen.queryByRole("combobox", { name: /hosting target/i }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('input[type="hidden"][name="hostingTarget"]'),
    ).toHaveAttribute("value", "Azure App Service");
  });

  it("shows a select when a field has multiple options", () => {
    render(
      <TemplateFormFields
        template={buildTemplate([
          {
            name: "hostingTarget",
            label: "Hosting Target",
            type: "select",
            required: true,
            options: ["Azure App Service", "Static Site"],
          },
        ])}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: /hosting target/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Azure App Service" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Static Site" }),
    ).toBeInTheDocument();
  });

  it("fails fast for unsupported field types", () => {
    expect(() =>
      render(
        <TemplateFormFields
          template={
            {
              id: "invalid",
              slug: "invalid",
              name: "Invalid",
              description: "Invalid",
              version: "1.0.0",
              status: "ACTIVE",
              fields: [
                {
                  name: "mystery",
                  label: "Mystery",
                  type: "checkbox",
                  required: true,
                },
              ],
            } as never
          }
        />,
      ),
    ).toThrow(/unsupported template field type/i);
  });
});
