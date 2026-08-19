import type { Prisma, RepositoryAccessStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  parseGitHubUsername,
  parseRepositoryAccessActorUsername,
} from "./access";

type ActorAccessDb = {
  auditLog: {
    findFirst(
      args: Prisma.AuditLogFindFirstArgs,
    ): Promise<{ event: string; details: Prisma.JsonValue } | null>;
    create(args: Prisma.AuditLogCreateArgs): Promise<unknown>;
  };
};

type ActorAccessInput = {
  requestId: string;
  actorUserId: string;
  githubUsername: string | null;
  legacyStatus: RepositoryAccessStatus;
  legacyNote: string | null;
};

export type ActorRepositoryAccess = {
  status: RepositoryAccessStatus;
  note: string | null;
};

type RepositoryAccessOutcomeStatus = Extract<
  RepositoryAccessStatus,
  "INVITED" | "GRANTED" | "FAILED"
>;

function repositoryAccessSummary(
  status: RepositoryAccessOutcomeStatus,
  githubUsername: string,
) {
  const actorUsername = parseGitHubUsername(githubUsername);

  switch (status) {
    case "INVITED":
      return `GitHub invited @${actorUsername} to this repository.`;
    case "GRANTED":
      return `GitHub access is ready for @${actorUsername}.`;
    case "FAILED":
      return `GitHub could not confirm repository access for @${actorUsername}. Check the username and try again.`;
  }
}

function detailsObject(details: Prisma.JsonValue) {
  return details && typeof details === "object" && !Array.isArray(details)
    ? details
    : null;
}

function outcomeFromAudit(
  audit: { event: string; details: Prisma.JsonValue } | null,
  githubUsername: string,
): ActorRepositoryAccess | null {
  const details = audit ? detailsObject(audit.details) : null;
  if (!audit || !details) return null;

  const recordedUsername = details.githubUsername;
  if (
    typeof recordedUsername !== "string" ||
    recordedUsername.toLowerCase() !== githubUsername.toLowerCase()
  ) {
    return null;
  }

  const status =
    audit.event === "REPOSITORY_ACCESS_FAILED"
      ? "FAILED"
      : details.accessStatus === "INVITED" ||
          details.accessStatus === "GRANTED"
        ? details.accessStatus
        : null;

  return status
    ? { status, note: repositoryAccessSummary(status, githubUsername) }
    : null;
}

function legacyOutcome(
  input: ActorAccessInput,
  githubUsername: string,
): ActorRepositoryAccess {
  if (
    input.legacyStatus !== "INVITED" &&
    input.legacyStatus !== "GRANTED" &&
    input.legacyStatus !== "FAILED"
  ) {
    return { status: "NOT_REQUESTED", note: null };
  }

  const legacyUsername = parseRepositoryAccessActorUsername(input.legacyNote);
  if (legacyUsername?.toLowerCase() !== githubUsername.toLowerCase()) {
    return { status: "NOT_REQUESTED", note: null };
  }

  return {
    status: input.legacyStatus,
    note: repositoryAccessSummary(input.legacyStatus, githubUsername),
  };
}

export async function resolveRepositoryAccessForActor(
  input: ActorAccessInput,
  db: ActorAccessDb = prisma,
): Promise<ActorRepositoryAccess> {
  if (!input.githubUsername) {
    return { status: "NOT_REQUESTED", note: null };
  }

  const audit = await db.auditLog.findFirst({
    where: {
      event: {
        in: ["REPOSITORY_ACCESS_SUCCEEDED", "REPOSITORY_ACCESS_FAILED"],
      },
      AND: [
        { details: { path: ["requestId"], equals: input.requestId } },
        { details: { path: ["actorUserId"], equals: input.actorUserId } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { event: true, details: true },
  });

  return (
    outcomeFromAudit(audit, input.githubUsername) ??
    legacyOutcome(input, input.githubUsername)
  );
}

export async function persistRepositoryAccessOutcome(
  input: {
    requestId: string;
    actorUserId: string;
    githubUsername: string;
    status: RepositoryAccessOutcomeStatus;
    supportReference: string;
    source: string;
  },
  db: ActorAccessDb = prisma,
) {
  const githubUsername = parseGitHubUsername(input.githubUsername);
  const safeSummary = repositoryAccessSummary(input.status, githubUsername);

  await db.auditLog.create({
    data: {
      event:
        input.status === "FAILED"
          ? "REPOSITORY_ACCESS_FAILED"
          : "REPOSITORY_ACCESS_SUCCEEDED",
      details: {
        requestId: input.requestId,
        actorUserId: input.actorUserId,
        githubUsername,
        accessStatus: input.status,
        safeSummary,
        supportReference: input.supportReference,
        source: input.source,
      },
    },
  });
}

export function buildSafeRepositoryAccessNote(
  status: RepositoryAccessOutcomeStatus,
  githubUsername: string,
) {
  return repositoryAccessSummary(status, githubUsername);
}
