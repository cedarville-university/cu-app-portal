import type { PrismaClient } from "@prisma/client";
import { appAccessWhere } from "@/features/app-requests/access";
import { createDefaultEnvVarServiceDeps, saveEnvironmentVariables, type EnvVarServiceDeps } from "@/features/env-vars/service";
import { normalizeEnvVarKey, validateEnvVarKey, validateEnvVarValue } from "@/features/env-vars/validation";
import { PortalApiError } from "@/features/portal-api/errors";
import type { PortalActor } from "@/features/portal-api/principal";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getAppEnvironmentSchema, setAppEnvironmentSchema, parseEnvironmentInput, type GetAppEnvironmentInput, type SetAppEnvironmentInput } from "./schemas";
import { isSensitiveEnvironmentKey, isSensitiveEnvironmentValue } from "./safety";

type EnvironmentDatabase = Pick<PrismaClient, "appRequest" | "appEnvironmentVariable">;
export type EnvironmentDependencies = {
  db: EnvironmentDatabase;
  createEnvDeps: () => EnvVarServiceDeps;
  audit: typeof recordAuditEvent;
};
const defaults: EnvironmentDependencies = { db: prisma, createEnvDeps: createDefaultEnvVarServiceDeps, audit: recordAuditEvent };

export async function authorizeEnvironmentApp(actor: PortalActor, appId: string, db: EnvironmentDatabase = prisma) {
  const app = await db.appRequest.findFirst({
    where: appAccessWhere(appId, actor.userId, actor.isAdmin),
    select: { id: true, appName: true, azureWebAppName: true, azureKeyVaultName: true, azureKeyVaultUri: true },
  });
  if (!app) throw new PortalApiError("NOT_FOUND", "App not found.");
  return app;
}

type EnvironmentVariable = {
  key: string;
  isSecret: boolean;
  updatedAt: string;
  valueStatus: "available" | "secret" | "withheld";
  value?: string;
};

export async function getAppEnvironment(actor: PortalActor, input: GetAppEnvironmentInput, deps: EnvironmentDependencies = defaults) {
  const { appId, offset, limit } = parseEnvironmentInput(getAppEnvironmentSchema, input);
  await authorizeEnvironmentApp(actor, appId, deps.db);
  const rows = await deps.db.appEnvironmentVariable.findMany({
    where: { appRequestId: appId },
    select: { key: true, isSecret: true, updatedAt: true },
    orderBy: [{ key: "asc" }, { id: "asc" }], skip: offset, take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const ordinaryKeys = page.filter(row => !row.isSecret && !isSensitiveEnvironmentKey(row.key)).map(row => row.key);
  // The predicate is important even after reading metadata: classification could
  // change between queries. Never select the value column for secret rows.
  const values = ordinaryKeys.length ? await deps.db.appEnvironmentVariable.findMany({
    where: { appRequestId: appId, isSecret: false, key: { in: ordinaryKeys } },
    select: { key: true, value: true },
  }) : [];
  const byKey = new Map(values.map(row => [row.key, row.value ?? ""]));
  const variables: EnvironmentVariable[] = page.map(row => {
    const metadata = { key: row.key, isSecret: row.isSecret, updatedAt: row.updatedAt.toISOString() };
    if (row.isSecret) return { ...metadata, valueStatus: "secret" };
    const value = byKey.get(row.key);
    if (value === undefined || isSensitiveEnvironmentKey(row.key) || isSensitiveEnvironmentValue(value)) {
      return { ...metadata, valueStatus: "withheld" };
    }
    return { ...metadata, valueStatus: "available", value };
  });
  return { appId, variables, nextOffset: rows.length > limit ? offset + limit : null, evidence: "Saved portal settings; not a live Azure configuration inspection. Secret values are never returned." };
}

export async function setAppEnvironment(actor: PortalActor, input: SetAppEnvironmentInput, deps: EnvironmentDependencies = defaults) {
  const { appId, variables } = parseEnvironmentInput(setAppEnvironmentSchema, input);
  const app = await authorizeEnvironmentApp(actor, appId, deps.db);
  const existing = await deps.db.appEnvironmentVariable.findMany({
    where: { appRequestId: appId }, select: { key: true, isSecret: true },
  });
  const seen = new Set<string>();
  for (const { key, value } of variables) {
    const normalized = normalizeEnvVarKey(key);
    const current = existing.find(row => normalizeEnvVarKey(row.key) === normalized);
    if (!validateEnvVarKey(key).ok || !validateEnvVarValue(value, false).ok || key === "__proto__" || seen.has(normalized) || (current && (current.isSecret || current.key !== key))) {
      throw new PortalApiError("INVALID_INPUT", "The batch contains invalid, reserved, duplicate, or conflicting variable names or values. No changes were applied.");
    }
    if (isSensitiveEnvironmentKey(key) || isSensitiveEnvironmentValue(value)) {
      throw new PortalApiError("INVALID_INPUT", "Sensitive settings cannot be set through MCP. Use secret settings in CU Launch. No changes were applied.");
    }
    seen.add(normalized);
  }
  try {
    await saveEnvironmentVariables(deps.createEnvDeps(), {
      appRequest: app,
      changes: variables.map(({ key, value }) => ({ operation: "set", key, value, isSecret: false })),
    });
  } catch {
    // Provider responses can include values; never forward their messages or
    // claim rollback across Azure and the database after a partial failure.
    throw new PortalApiError("PROVIDER_FAILURE", "Environment settings could not be saved. Changes may have been partially applied; check CU Launch before retrying.");
  }
  for (const { key } of variables) {
    await deps.audit("ENV_VAR_SET", { actorUserId: actor.userId, requestId: appId, key, isSecret: false, source: "codex-mcp" });
  }
  return { appId, keys: variables.map(({ key }) => key), application: app.azureWebAppName ? "live_settings_update" as const : "next_publish" as const };
}
