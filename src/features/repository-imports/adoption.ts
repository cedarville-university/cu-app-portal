import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { createSupportReference } from "@/lib/support-reference";
import { PortalApiError } from "@/features/portal-api/errors";
import { sha256StableJson } from "@/features/portal-api/stable-json";
import { appListWhereForUser } from "@/features/app-requests/access";
import { bootstrapManagedRepository } from "@/features/repositories/bootstrap-managed-repository";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { PORTAL_SKILL_PATH, buildManagedAppPortalSkill } from "@/features/generation/portal-skill";
import { addExistingAppForActor, type ImportActor } from "./service";
import { createRepositoryImportQueue } from "./queue";
import { parseGitHubRepositoryUrl } from "./repo-url";

export const adoptionInputSchema = z.object({
  idempotencyKey: z.string().uuid(),
  appName: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500),
  repositoryUrl: z.string().url().max(300).optional(),
  databaseProvider: z.enum(["none", "postgresql"]),
  entraLogin: z.boolean(),
  publicAcknowledgement: z.literal(true).optional(),
}).strict();
export type AdoptionInput = z.infer<typeof adoptionInputSchema>;

// Creation keys are bound to durable app IDs, not an expiring response cache.
// A lost provider response can resume provisioning only that same marked repo.
export async function adoptExistingApp(actor: ImportActor, rawInput: AdoptionInput) {
  const parsed = adoptionInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new PortalApiError("INVALID_INPUT", "Check the import choices.");
  const input = parsed.data;
  if (!input.entraLogin && !input.publicAcknowledgement) {
    throw new PortalApiError("INVALID_INPUT", "Acknowledge that anyone with the address can use this public app.");
  }
  const source = input.repositoryUrl ? parseGitHubRepositoryUrl(input.repositoryUrl) : null;
  const normalized = { ...input, ...(source ? { repositoryUrl: source.normalizedUrl } : {}) };
  const digest = await sha256StableJson(normalized);
  const requestId = `adopt-${createHash("sha256").update(`${actor.userId}:${input.idempotencyKey}`).digest("hex").slice(0, 40)}`;
  const existing = await prisma.appRequest.findUnique({ where: { id: requestId }, include: { repositoryImport: true } });
  if (existing) {
    if (existing.userId !== actor.userId) throw new PortalApiError("NOT_FOUND", "App not found.");
    const config = existing.submittedConfig as Record<string, unknown>;
    if (config.adoptionDigest !== digest) throw new PortalApiError("CONFLICT", "This import key was used for different choices.");
    if (source) {
      // Resending the same attempt is safe: the durable runner claims it once.
      if (existing.repositoryImport?.activeAttemptId && existing.repositoryStatus === "PENDING") {
        await createRepositoryImportQueue().send({ attemptId: existing.repositoryImport.activeAttemptId });
      }
      return { requestId };
    }
    if (existing.repositoryStatus === "READY" && existing.repositoryImport) return { requestId };
  }

  if (source) {
    const config = loadGitHubAppConfig();
    // An installation can read private org repos on behalf of the portal. That
    // does not establish this actor's authority to adopt them or grant access.
    if (Object.keys(config.installationIdsByOrg).some(owner => owner.toLowerCase() === source.owner.toLowerCase())) {
      const known = await prisma.appRequest.findFirst({
        where: {
          ...(actor.isAdmin ? {} : appListWhereForUser(actor.userId)),
          repositoryOwner: { equals: source.owner, mode: "insensitive" },
          repositoryName: { equals: source.name, mode: "insensitive" },
        }, select: { id: true },
      });
      if (known) return { requestId: known.id };
      throw new PortalApiError("ACTION_REQUIRED", "Use the local upload route for this source, or ask its CU Launch owner for access.");
    }
    const form = new FormData();
    form.set("repositoryUrl", source.normalizedUrl);
    form.set("appName", input.appName); form.set("description", input.description);
    form.set("databaseProvider", input.databaseProvider); form.set("entraLogin", String(input.entraLogin));
    try {
      return await addExistingAppForActor(actor, form, { requestIdentity: { requestId, digest } });
    } catch (error) {
      if (isUniqueViolation(error)) return adoptExistingApp(actor, input);
      // A queue/provider failure may have happened after the durable record was
      // created. Return that app, never suggest replacing it with another one.
      const recorded = await prisma.appRequest.findUnique({ where: { id: requestId } });
      if (recorded?.userId === actor.userId) return { requestId };
      // Do not expose private lookup failures or provider payloads.
      throw new PortalApiError("ACTION_REQUIRED", "No app was created. Check the source URL and portal access, or approve the local upload route. Reuse this import key when checking an uncertain result.");
    }
  }

  if (!existing) {
    const template = await prisma.template.upsert({
      where: { slug: "imported-web-app" },
      update: {},
      create: { slug: "imported-web-app", name: "Imported Web App", description: "Existing app", version: "1.0.0", status: "ACTIVE", inputSchema: {}, hostingOptions: ["Azure App Service"] },
    });
    try {
      await prisma.appRequest.create({ data: {
        id: requestId, userId: actor.userId, templateId: template.id, templateVersion: "1.0.0",
        appName: input.appName, supportReference: createSupportReference(),
        submittedConfig: { adoptionDigest: digest, description: input.description, templateSlug: "imported-web-app", hostingTarget: "Azure App Service", localOnlySource: true, databaseProvider: input.databaseProvider, entraLogin: input.entraLogin, importFeatures: { databaseProvider: input.databaseProvider, entraLogin: input.entraLogin } },
        generationStatus: "SUCCEEDED", sourceOfTruth: "IMPORTED_REPOSITORY", repositoryStatus: "PENDING", publishStatus: "NOT_STARTED", deploymentTarget: "Azure App Service",
      } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new PortalApiError("CONFLICT", "This import is being created. Reuse the same import key to resume.");
      throw error;
    }
    await recordAuditEvent("EXISTING_APP_ADD_REQUESTED", { requestId, actorUserId: actor.userId, source: "codex-mcp" });
  }
  const repository = await bootstrapManagedRepository({
    appRequestId: requestId,
    input: { templateSlug: "web-app", appName: input.appName, description: input.description, hostingTarget: "Azure App Service", databaseProvider: input.databaseProvider, entraLogin: input.entraLogin },
    files: { [PORTAL_SKILL_PATH]: buildManagedAppPortalSkill() },
    reuseExistingRepository: true,
  });
  // Write the import record first; READY means both records are durable.
  await prisma.repositoryImport.upsert({
    where: { appRequestId: requestId }, update: {},
    create: {
      appRequestId: requestId, sourceRepositoryUrl: repository.url, sourceRepositoryOwner: repository.owner,
      sourceRepositoryName: repository.name, sourceRepositoryDefaultBranch: repository.defaultBranch,
      targetRepositoryOwner: repository.owner, targetRepositoryName: repository.name, targetRepositoryUrl: repository.url,
      targetRepositoryDefaultBranch: repository.defaultBranch, importStatus: "NOT_REQUIRED", compatibilityStatus: "NOT_SCANNED", compatibilityFindings: [], preparationStatus: "PENDING_USER_CHOICE",
    },
  });
  await prisma.appRequest.update({ where: { id: requestId }, data: {
    repositoryProvider: "GITHUB", repositoryOwner: repository.owner, repositoryName: repository.name,
    repositoryUrl: repository.url, repositoryDefaultBranch: repository.defaultBranch,
    repositoryVisibility: repository.visibility, repositoryStatus: "READY",
  } });
  await recordAuditEvent("EXISTING_APP_IMPORT_SUCCEEDED", { requestId, actorUserId: actor.userId, source: "codex-mcp", targetRepositoryUrl: repository.url });
  return { requestId };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
