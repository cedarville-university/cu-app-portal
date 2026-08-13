"use server";

import { signIn } from "@/auth/session";

function getSafeRedirectTo(redirectTo: string) {
  return redirectTo.startsWith("/") && !redirectTo.startsWith("//")
    ? redirectTo
    : "/";
}

export async function loginAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/");
  const safeRedirectTo = getSafeRedirectTo(redirectTo);

  await signIn("microsoft-entra-id", { redirectTo: safeRedirectTo });
}
