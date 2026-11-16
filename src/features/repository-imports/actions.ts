"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { userHasAdminRole } from "@/features/app-requests/access";
import { isRepositoryImportInputError } from "./errors";
import {
  addExistingAppForActor, createManagedRepositoryForLocalAppForActor,
  prepareExistingAppForActor, verifyExistingAppPreparationForActor,
  retryRepositoryImportForActor,
  type AddExistingAppDeps, type PrepareExistingAppDeps, type VerifyExistingAppPreparationDeps,
} from "./service";
import type { RepositoryImportQueue } from "./queue";

async function actor() {
  const userId = await resolveCurrentUserId();
  return { userId, isAdmin: await userHasAdminRole(userId) };
}
function revalidate(requestId: string) {
  revalidatePath("/apps");
  revalidatePath(`/download/${requestId}`);
  revalidatePath(`/onboarding/${requestId}`);
}
export async function addExistingAppAction(formData: FormData, deps: AddExistingAppDeps = {}) {
  const result = await addExistingAppForActor(await actor(), formData, deps);
  revalidatePath("/apps");
  return result;
}
export type AddExistingAppFormState = { error: string | null };
export async function addExistingAppFormAction(_state: AddExistingAppFormState, formData: FormData, deps: AddExistingAppDeps = {}): Promise<AddExistingAppFormState> {
  let result: Awaited<ReturnType<typeof addExistingAppAction>>;
  try { result = await addExistingAppAction(formData, deps); }
  catch (error) {
    if (isRepositoryImportInputError(error)) return { error: error.message };
    console.error("Add existing app form submission failed.", error);
    return { error: "The portal could not check that repository right now. Try again or contact support." };
  }
  redirect(`/onboarding/${result.requestId}`);
}
export async function createManagedRepositoryForLocalAppAction(formData: FormData) {
  const result = await createManagedRepositoryForLocalAppForActor(await actor(), formData);
  revalidatePath("/apps");
  return result;
}
export async function retryRepositoryImport(requestId: string, deps: { queue?: RepositoryImportQueue; now?: () => Date } = {}) {
  const result = await retryRepositoryImportForActor(await actor(), requestId, deps);
  revalidate(requestId);
  return result;
}
export async function retryRepositoryImportAction(requestId: string, _formData: FormData): Promise<void> {
  await retryRepositoryImport(requestId);
}
export async function prepareExistingAppAction(requestId: string, formData: FormData, deps: PrepareExistingAppDeps = {}) {
  await prepareExistingAppForActor(await actor(), requestId, formData, deps);
  revalidate(requestId);
}
export async function verifyExistingAppPreparationAction(requestId: string, deps: VerifyExistingAppPreparationDeps = {}) {
  await verifyExistingAppPreparationForActor(await actor(), requestId, deps);
  revalidate(requestId);
}
