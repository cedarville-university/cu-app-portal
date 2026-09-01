import type { User } from "@prisma/client";
import type { JWTVerifyGetKey } from "jose";
import { userHasAdminRole } from "@/features/app-requests/access";
import { prisma } from "@/lib/db";
import {
  validatePortalApiBearerToken,
  type ValidatedEntraPrincipal,
} from "./auth";
import {
  loadPortalApiConfig,
  type EnabledPortalApiConfig,
} from "./config";
import { PortalApiError } from "./errors";

type PortalUser = Pick<User, "id" | "entraOid" | "email" | "displayName">;

export type PortalUserStore = {
  upsert(args: {
    where: { entraOid: string };
    update: { email: string; displayName: string };
    create: { entraOid: string; email: string; displayName: string };
  }): Promise<PortalUser>;
};

export type PortalActor = {
  userId: string;
  entraOid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
};

type PrincipalDependencies = {
  users?: PortalUserStore;
  hasAdminRole?: (userId: string) => Promise<boolean>;
};

type AuthenticationDependencies = PrincipalDependencies & {
  env?: Record<string, string | undefined>;
  nodeEnv?: string;
  jwks?: JWTVerifyGetKey;
};

const defaultUserStore = prisma.user as unknown as PortalUserStore;

export async function resolvePortalActor(
  principal: ValidatedEntraPrincipal,
  dependencies: PrincipalDependencies = {},
): Promise<PortalActor> {
  const users = dependencies.users ?? defaultUserStore;
  const hasAdminRole = dependencies.hasAdminRole ?? userHasAdminRole;
  const user = await users.upsert({
    where: { entraOid: principal.entraOid },
    update: {
      email: principal.email,
      displayName: principal.displayName,
    },
    create: {
      entraOid: principal.entraOid,
      email: principal.email,
      displayName: principal.displayName,
    },
  });

  return {
    userId: user.id,
    entraOid: user.entraOid,
    email: user.email,
    displayName: user.displayName,
    isAdmin: await hasAdminRole(user.id),
  };
}

export async function authenticatePortalApiRequest(
  request: Request,
  dependencies: AuthenticationDependencies = {},
): Promise<{ actor: PortalActor; config: EnabledPortalApiConfig }> {
  const config = loadPortalApiConfig(
    dependencies.env ?? process.env,
    dependencies.nodeEnv ?? process.env.NODE_ENV,
  );
  if (!config.enabled) {
    throw new PortalApiError("NOT_FOUND", "Not found.");
  }

  const principal = await validatePortalApiBearerToken(
    request.headers.get("Authorization"),
    config,
    { jwks: dependencies.jwks },
  );
  const actor = await resolvePortalActor(principal, dependencies);
  return { actor, config };
}
