import { prisma } from "@/lib/db";

export function appAccessWhere(
  requestId: string,
  userId: string,
  isAdmin: boolean,
) {
  if (isAdmin) {
    return { id: requestId };
  }

  return {
    id: requestId,
    OR: [
      { userId },
      {
        collaborators: {
          some: { userId },
        },
      },
    ],
  };
}

export async function userHasAdminRole(userId: string) {
  const role = await prisma.userRole.findFirst({
    where: {
      userId,
      role: "ADMIN",
    },
  });

  return Boolean(role);
}

export async function canDeleteApp(userId: string, requestId: string) {
  if (await userHasAdminRole(userId)) {
    return true;
  }

  const appRequest = await prisma.appRequest.findFirst({
    where: {
      id: requestId,
      userId,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  return appRequest?.userId === userId;
}
