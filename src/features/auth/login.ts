"use server";

import { signIn } from "@/auth/session";

export async function loginAction(redirectTo = "/") {
  const safeRedirectTo = redirectTo.startsWith("/") && !redirectTo.startsWith("//")
    ? redirectTo
    : "/";

  await signIn("microsoft-entra-id", { redirectTo: safeRedirectTo });
}
