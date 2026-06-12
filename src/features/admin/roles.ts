import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

export function getInitialAdminEmails() {
  return (process.env.PORTAL_INITIAL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function ensureInitialAdminRole({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!getInitialAdminEmails().includes(normalizedEmail)) {
    return;
  }

  await prisma.userRole.upsert({
    where: {
      userId_role: {
        userId,
        role: "ADMIN",
      },
    },
    update: {},
    create: {
      userId,
      role: "ADMIN",
    },
  });
}

export async function isAdminUser(userId: string) {
  const role = await prisma.userRole.findFirst({
    where: {
      userId,
      role: "ADMIN",
    },
  });

  return Boolean(role);
}

export async function requireAdminUserId() {
  const userId = await resolveCurrentUserId();

  if (!(await isAdminUser(userId))) {
    throw new Error("Administrator access is required.");
  }

  return userId;
}
