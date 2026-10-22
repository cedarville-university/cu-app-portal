import { z } from "zod";
import type { ImportedAppRuntime } from "./compatibility";

export type ImportedAppFeatures = {
  databaseProvider: "postgresql" | "none";
  entraLogin: boolean;
};

const featuresSchema = z.object({
  databaseProvider: z.enum(["postgresql", "none"]),
  entraLogin: z.boolean(),
});

export function readImportedFeatures(formData: FormData): ImportedAppFeatures | undefined {
  const databaseProvider = formData.get("databaseProvider");
  const login = formData.get("entraLogin");
  // Older callers retain runtime defaults; new forms always submit both choices.
  if (databaseProvider === null && login === null) return undefined;
  return featuresSchema.parse({
    databaseProvider,
    entraLogin: z.enum(["true", "false"]).parse(login) === "true",
  });
}

export function savedImportedFeatures(config: unknown): ImportedAppFeatures | undefined {
  if (!config || typeof config !== "object" || !("importFeatures" in config)) return undefined;
  return featuresSchema.parse(config.importFeatures);
}

export function resolveImportedFeatures(
  runtime: ImportedAppRuntime | null,
  features?: ImportedAppFeatures,
): ImportedAppFeatures {
  return features ?? {
    databaseProvider: runtime?.framework === "nextjs" ? "postgresql" : "none",
    entraLogin: runtime?.framework === "nextjs",
  };
}

export function importedFeaturesIssue(runtime: ImportedAppRuntime | null, features: ImportedAppFeatures) {
  return runtime?.framework === "http-server" &&
    (features.databaseProvider === "postgresql" || features.entraLogin)
    ? "This app needs a supported server for the selected database or Cedarville login. Use Codex to migrate it to Next.js, Express, or FastAPI, connect the selected services, and upload the changed code before preparing again."
    : null;
}
