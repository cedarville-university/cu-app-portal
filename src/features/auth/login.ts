"use server";

import { signIn } from "@/auth/session";
import { getGitHubProfileSetupUrl } from "./return-to";

export async function loginAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/");
  const safeRedirectTo = getGitHubProfileSetupUrl(redirectTo);

  await signIn("microsoft-entra-id", { redirectTo: safeRedirectTo });
}
