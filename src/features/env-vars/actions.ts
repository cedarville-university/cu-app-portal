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
  saveEnvironmentVariables,
  type EnvVarChange,
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

export type EnvVarDeleteState = { error: string | null };

export async function deleteEnvVarFormAction(
  appRequestId: string,
  key: string,
  _prevState: EnvVarDeleteState,
  formData: FormData,
): Promise<EnvVarDeleteState> {
  void formData;

  try {
    const appRequest = await loadAccessibleEnvVarAppRequest(appRequestId);
    const { isSecret } = await deleteEnvironmentVariable(
      createDefaultEnvVarServiceDeps(),
      { appRequest, key },
    );

    await recordAuditEvent("ENV_VAR_DELETED", {
      requestId: appRequestId,
      key,
      isSecret,
    });
    revalidatePath(`/download/${appRequestId}`);

    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not delete the environment variable.",
    };
  }
}


export type EnvVarsFormState = { error: string | null; saved: boolean };

export async function saveEnvVarsFormAction(
  appRequestId: string,
  _prevState: EnvVarsFormState,
  formData: FormData,
): Promise<EnvVarsFormState> {
  try {
    const appRequest = await loadAccessibleEnvVarAppRequest(appRequestId);
    const parsed: unknown = JSON.parse(String(formData.get("changes") ?? ""));
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 100) {
      throw new Error("Submit between 1 and 100 variable changes at a time.");
    }
    const changes: EnvVarChange[] = parsed.map((change: unknown) => {
      if (!change || typeof change !== "object" || !("key" in change) || typeof change.key !== "string" || !("operation" in change)) {
        throw new Error("Invalid environment variable changes.");
      }
      if (change.operation === "delete") return { operation: "delete", key: change.key.trim() };
      if (change.operation !== "set" || !("value" in change) || typeof change.value !== "string" || !("isSecret" in change) || typeof change.isSecret !== "boolean") {
        throw new Error("Invalid environment variable changes.");
      }
      return { operation: "set", key: change.key.trim(), value: change.value, isSecret: change.isSecret };
    });
    const applied = await saveEnvironmentVariables(createDefaultEnvVarServiceDeps(), { appRequest, changes });
    for (const change of applied) {
      await recordAuditEvent(change.operation === "delete" ? "ENV_VAR_DELETED" : "ENV_VAR_SET", {
        requestId: appRequestId, key: change.key, isSecret: change.isSecret,
      });
    }
    revalidatePath(`/download/${appRequestId}`);
    return { error: null, saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save environment variable changes.", saved: false };
  }
}
