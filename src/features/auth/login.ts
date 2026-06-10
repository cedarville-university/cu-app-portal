"use server";

import { signIn } from "@/auth/session";

export async function loginAction() {
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}
