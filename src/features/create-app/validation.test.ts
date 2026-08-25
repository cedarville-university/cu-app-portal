import { describe, expect, it } from "vitest";
import { getTemplateBySlug } from "@/features/templates/catalog";
import type { TemplateFeatures } from "@/features/templates/types";
import { createAppSchema } from "./validation";

const optionalFeatures = {
  database: {
    mode: "optional",
    providerOptions: ["postgresql"],
    defaultProvider: "postgresql",
  },
  entraLogin: { mode: "optional", defaultEnabled: true },
} satisfies TemplateFeatures;

const unsupportedFeatures = {
  database: {
    mode: "unsupported",
    providerOptions: [],
    defaultProvider: "none",
  },
  entraLogin: { mode: "unsupported", defaultEnabled: false },
} satisfies TemplateFeatures;

const requiredFeatures = {
  database: {
    mode: "required",
    providerOptions: ["postgresql"],
    defaultProvider: "postgresql",
  },
  entraLogin: { mode: "required", defaultEnabled: true },
} satisfies TemplateFeatures;

describe("createAppSchema", () => {
  it("accepts valid form input", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: optionalFeatures,
    }).safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
      entraLogin: "true",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a blank app name", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: optionalFeatures,
      requirePublicAcknowledgement: true,
    }).safeParse({
      appName: "",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsupported hosting targets", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: optionalFeatures,
    }).safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Vercel",
    });

    expect(result.success).toBe(false);
  });

  it("rejects app names that do not produce a usable Azure app slug", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: optionalFeatures,
    }).safeParse({
      appName: "!!!",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
    });

    expect(result.success).toBe(false);
  });

  it("rejects app names whose Azure slug would be too long", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: optionalFeatures,
    }).safeParse({
      appName: "campus-dashboard-".repeat(4),
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
    });

    expect(result.success).toBe(false);
  });

  it("accepts supported database and Entra selections", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: optionalFeatures,
    }).safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: "true",
    });

    expect(result).toMatchObject({
      success: true,
      data: expect.objectContaining({
        databaseProvider: "postgresql",
        entraLogin: true,
      }),
    });
  });

  it("requires an explicit audience choice", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: optionalFeatures,
    }).safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["entraLogin"] }),
      ]),
    );
  });

  it("requires acknowledgement before creating an openly public app", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: optionalFeatures,
      requirePublicAcknowledgement: true,
    }).safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: "false",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["publicAcknowledgement"] }),
      ]),
    );
  });

  it("accepts FastAPI with PostgreSQL and Entra login", () => {
    const template = getTemplateBySlug("python-fastapi");

    if (!template) {
      throw new Error("python-fastapi template missing");
    }

    const parsed = createAppSchema({
      hostingTarget: "Azure App Service",
      features: template.features,
    }).parse({
      appName: "Reports API",
      description: "Department reports",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: "true",
    });

    expect(parsed.databaseProvider).toBe("postgresql");
    expect(parsed.entraLogin).toBe(true);
  });

  it("accepts department form presets with required PostgreSQL and Entra login", () => {
    const template = getTemplateBySlug("department-form-approval");

    if (!template) {
      throw new Error("department-form-approval template missing");
    }

    const parsed = createAppSchema({
      hostingTarget: "Azure App Service",
      features: template.features,
    }).parse({
      appName: "Travel Approval",
      description: "Department travel requests",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: "true",
    });

    expect(parsed.databaseProvider).toBe("postgresql");
    expect(parsed.entraLogin).toBe(true);
  });

  it("rejects a database for public information pages while allowing either audience", () => {
    const template = getTemplateBySlug("public-information-page");

    if (!template) {
      throw new Error("public-information-page template missing");
    }

    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: template.features,
    }).safeParse({
      appName: "Program Info",
      description: "Information page",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: "true",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["databaseProvider"],
          message: "This template does not support a database.",
        }),
      ]),
    );
  });

  it("rejects PostgreSQL when the template does not support a database", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: unsupportedFeatures,
    }).safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: "false",
    });

    expect(result.success).toBe(false);
  });

  it("allows Cedarville sign-in even when legacy template metadata marks it unsupported", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: unsupportedFeatures,
    }).safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
      databaseProvider: "none",
      entraLogin: "true",
    });

    expect(result.success).toBe(true);
  });

  it("rejects no database when the template requires one", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: requiredFeatures,
    }).safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
      databaseProvider: "none",
      entraLogin: "true",
    });

    expect(result.success).toBe(false);
  });

  it("allows an openly public choice even when legacy template metadata requires login", () => {
    const result = createAppSchema({
      hostingTarget: "Azure App Service",
      features: requiredFeatures,
    }).safeParse({
      appName: "Campus Dashboard",
      description: "Shows campus metrics.",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: "false",
    });

    expect(result.success).toBe(true);
  });
});
