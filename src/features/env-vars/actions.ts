"use server";

import { revalidatePath } from "next/cache";
import {
  appAccessWhere,
  userHasAdminRole,
} from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  createDefaultEnvVarServiceDeps,
  deleteEnvironmentVariable,
  saveEnvironmentVariable,
  type EnvVarAppRequest,
} from "./service";

export type EnvVarFormState = {
  error: string | null;
  savedKey: string | null;
};

async function loadAccessibleEnvVarAppRequest(
  appRequestId: string,
): Promise<EnvVarAppRequest> {
  const userId = await resolveCurrentUserId();
  const isAdmin = await userHasAdminRole(userId);
  const appRequest = await prisma.appRequest.findFirst({
    where: appAccessWhere(appRequestId, userId, isAdmin),
    select: {
      id: true,
      appName: true,
      azureWebAppName: true,
      azureKeyVaultName: true,
      azureKeyVaultUri: true,
    },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return appRequest;
}

export async function saveEnvVarFormAction(
  appRequestId: string,
  _prevState: EnvVarFormState,
  formData: FormData,
): Promise<EnvVarFormState> {
  const key = String(formData.get("key") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  const isSecret = formData.get("isSecret") === "true";

  try {
    const appRequest = await loadAccessibleEnvVarAppRequest(appRequestId);

    await saveEnvironmentVariable(createDefaultEnvVarServiceDeps(), {
      appRequest,
      key,
      value,
      isSecret,
    });
    await recordAuditEvent("ENV_VAR_SET", {
      requestId: appRequestId,
      key,
      isSecret,
    });
    revalidatePath(`/download/${appRequestId}`);

    return { error: null, savedKey: key };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not save the environment variable.",
      savedKey: null,
    };
  }
}

export async function deleteEnvVarAction(appRequestId: string, key: string) {
  const appRequest = await loadAccessibleEnvVarAppRequest(appRequestId);

  await deleteEnvironmentVariable(createDefaultEnvVarServiceDeps(), {
    appRequest,
    key,
  });
  await recordAuditEvent("ENV_VAR_DELETED", {
    requestId: appRequestId,
    key,
  });
  revalidatePath(`/download/${appRequestId}`);
}
