import { z } from "zod";
import type { TemplateFeatures } from "@/features/templates/types";

export type CreateAppSchemaOptions = {
  hostingTarget: "Azure App Service";
  features: TemplateFeatures;
};

function toAzureAppSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

export function createAppSchema(options: CreateAppSchemaOptions) {
  const { features } = options;
  const databaseProviderOptions: readonly string[] =
    features.database.providerOptions;
  const defaultEntraLogin = String(
    options.features.entraLogin.defaultEnabled,
  ) as "true" | "false";

  return z.object({
    appName: z
      .string()
      .trim()
      .min(1, "Enter an app name.")
      .superRefine((value, ctx) => {
        const slug = toAzureAppSlug(value);

        if (!slug) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Use letters or numbers in the app name.",
          });
        }

        if (slug.length > 60) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Use a shorter app name so the Azure app name stays within 60 characters.",
          });
        }
      }),
    description: z.string().trim().min(1, "Enter a short description."),
    hostingTarget: z.literal(options.hostingTarget, {
      errorMap: () => ({
        message: `Choose one of: ${options.hostingTarget}.`,
      }),
    }),
    databaseProvider: z
      .enum(["none", "postgresql"])
      .default(options.features.database.defaultProvider),
    entraLogin: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .default(defaultEntraLogin)
      .transform((value) => value === true || value === "true"),
  }).superRefine((value, ctx) => {
    if (
      features.database.mode === "unsupported" &&
      value.databaseProvider !== "none"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["databaseProvider"],
        message: "This template does not support a database.",
      });
    }

    if (
      features.database.mode === "required" &&
      value.databaseProvider === "none"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["databaseProvider"],
        message: "Choose PostgreSQL for this template.",
      });
    }

    if (
      value.databaseProvider === "postgresql" &&
      !databaseProviderOptions.includes("postgresql")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["databaseProvider"],
        message: "This template does not support PostgreSQL.",
      });
    }

    if (features.entraLogin.mode === "unsupported" && value.entraLogin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entraLogin"],
        message: "This template does not support Entra login.",
      });
    }

    if (features.entraLogin.mode === "required" && !value.entraLogin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entraLogin"],
        message: "Entra login is required for this template.",
      });
    }
  });
}

export type CreateAppInput = z.infer<ReturnType<typeof createAppSchema>>;
