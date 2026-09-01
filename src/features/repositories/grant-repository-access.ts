import type { Prisma } from "@prisma/client";
import { appAccessWhere, userHasAdminRole } from "@/features/app-requests/access";
import { PortalApiError } from "@/features/portal-api/errors";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  buildSafeRepositoryAccessNote,
  persistRepositoryAccessOutcome,
} from "./actor-access";
import { grantManagedRepositoryAccess, parseGitHubUsername } from "./access";

type RepositoryAccessAppRequest = {
  id: string;
  repositoryStatus: string;
  repositoryOwner: string | null;
  repositoryName: string | null;
  supportReference: string;
};

type RepositoryAccessDb = {
  appRequest: {
    findFirst(
      args: Prisma.AppRequestFindFirstArgs,
    ): Promise<RepositoryAccessAppRequest | null>;
  };
  user: {
    update(args: Prisma.UserUpdateArgs): Promise<unknown>;
  };
};

export type RepositoryAccessResult = {
  status: "INVITED" | "GRANTED" | "FAILED";
  note: string;
  githubUsername: string;
};

export type GrantRepositoryAccessDependencies = {
  prisma: RepositoryAccessDb;
  appAccessWhere: typeof appAccessWhere;
  userHasAdminRole: typeof userHasAdminRole;
  parseGitHubUsername: typeof parseGitHubUsername;
  grantManagedRepositoryAccess: typeof grantManagedRepositoryAccess;
  recordAuditEvent: typeof recordAuditEvent;
  persistRepositoryAccessOutcome: typeof persistRepositoryAccessOutcome;
  buildSafeRepositoryAccessNote: typeof buildSafeRepositoryAccessNote;
};

const defaultDependencies: GrantRepositoryAccessDependencies = {
  prisma,
  appAccessWhere,
  userHasAdminRole,
  parseGitHubUsername,
  grantManagedRepositoryAccess,
  recordAuditEvent,
  persistRepositoryAccessOutcome,
  buildSafeRepositoryAccessNote,
};

function assertRepositoryReady(
  appRequest: RepositoryAccessAppRequest,
): asserts appRequest is RepositoryAccessAppRequest & {
  repositoryStatus: "READY";
  repositoryOwner: string;
  repositoryName: string;
} {
  if (
    appRequest.repositoryStatus !== "READY" ||
    !appRequest.repositoryOwner ||
    !appRequest.repositoryName
  ) {
    throw new PortalApiError(
      "ACTION_REQUIRED",
      "Managed repository is not ready for GitHub access grants.",
    );
  }
}

async function loadAccessibleAppRequest(
  requestId: string,
  actorUserId: string,
  dependencies: GrantRepositoryAccessDependencies,
) {
  const actorIsAdmin = await dependencies.userHasAdminRole(actorUserId);
  const appRequest = await dependencies.prisma.appRequest.findFirst({
    where: dependencies.appAccessWhere(requestId, actorUserId, actorIsAdmin),
  });

  if (!appRequest) {
    throw new PortalApiError("NOT_FOUND", "App not found.");
  }

  return appRequest;
}

export async function grantRepositoryAccessForActor(
  input: {
    requestId: string;
    actorUserId: string;
    githubUsername: string;
    source: "portal-ui" | "codex-mcp";
    portalOperation?: string;
    idempotencyKey?: string;
  },
  dependencies: GrantRepositoryAccessDependencies = defaultDependencies,
): Promise<RepositoryAccessResult> {
  const appRequest = await loadAccessibleAppRequest(
    input.requestId,
    input.actorUserId,
    dependencies,
  );
  assertRepositoryReady(appRequest);
  let githubUsername: string;
  try {
    githubUsername = dependencies.parseGitHubUsername(input.githubUsername);
  } catch {
    throw new PortalApiError("INVALID_INPUT", "Enter a valid GitHub username.");
  }

  await dependencies.prisma.user.update({
    where: { id: input.actorUserId },
    data: { githubUsername },
  });
  await dependencies.recordAuditEvent("REPOSITORY_ACCESS_REQUESTED", {
    requestId: input.requestId,
    actorUserId: input.actorUserId,
    supportReference: appRequest.supportReference,
    githubUsername,
    source: input.source,
    ...(input.portalOperation && input.idempotencyKey
      ? {
          operation: input.portalOperation,
          idempotencyKey: input.idempotencyKey,
        }
      : {}),
  });

  const authorizedAppRequest = await loadAccessibleAppRequest(
    input.requestId,
    input.actorUserId,
    dependencies,
  );
  assertRepositoryReady(authorizedAppRequest);

  let status: RepositoryAccessResult["status"];
  try {
    status = (
      await dependencies.grantManagedRepositoryAccess({
        owner: authorizedAppRequest.repositoryOwner,
        repositoryName: authorizedAppRequest.repositoryName,
        githubUsername,
      })
    ).status;
  } catch {
    status = "FAILED";
  }

  const note = dependencies.buildSafeRepositoryAccessNote(status, githubUsername);

  try {
    await dependencies.persistRepositoryAccessOutcome({
      requestId: input.requestId,
      actorUserId: input.actorUserId,
      githubUsername,
      status,
      supportReference: authorizedAppRequest.supportReference,
      source: input.source,
    });
  } catch {
    throw new PortalApiError(
      "PROVIDER_FAILURE",
      "The GitHub access result could not be saved. Please try again.",
    );
  }

  return { status, note, githubUsername };
}
