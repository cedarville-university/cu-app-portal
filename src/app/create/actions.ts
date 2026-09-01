"use server";

import { redirect } from "next/navigation";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { createGeneratedApp } from "@/features/app-requests/create-generated-app";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { createAppSchema } from "@/features/create-app/validation";
import { getActiveTemplateBySlug } from "@/features/templates/catalog";

export async function extractCreateAppInput(
  formData: FormData,
): Promise<CreateAppRequestInput> {
  const templateSlug = String(formData.get("templateSlug") ?? "").trim();
  const template = getActiveTemplateBySlug(templateSlug);

  if (!template) {
    throw new Error("Invalid template selection.");
  }

  const payload = {
    templateSlug: template.slug,
    appName: String(formData.get("appName") ?? ""),
    description: String(formData.get("description") ?? ""),
    hostingTarget: String(
      formData.get("hostingTarget") ?? template.hostingTarget,
    ),
    databaseProvider: String(
      formData.get("databaseProvider") ??
        template.features.database.defaultProvider,
    ),
    entraLogin: String(
      formData.get("entraLogin") ?? "",
    ),
    publicAcknowledgement: formData.get("publicAcknowledgement") ?? undefined,
  };

  const parsed = createAppSchema({
    hostingTarget: template.hostingTarget,
    features: template.features,
    requirePublicAcknowledgement: true,
  }).parse(payload);

  const { publicAcknowledgement: _publicAcknowledgement, ...input } = parsed;
  return { ...input, templateSlug: payload.templateSlug };
}

export async function createAppAction(formData: FormData) {
  const input = await extractCreateAppInput(formData);
  const actorUserId = await resolveCurrentUserId();
  const result = await createGeneratedApp({
    actorUserId,
    input,
    source: "portal-ui",
  });

  redirect(`/onboarding/${result.requestId}`);
}
