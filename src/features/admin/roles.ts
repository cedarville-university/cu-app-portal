import { Prisma } from "@prisma/client";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

const INITIAL_ADMIN_BOOTSTRAP_ATTEMPTS = 3;

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

  for (let attempt = 1; attempt <= INITIAL_ADMIN_BOOTSTRAP_ATTEMPTS; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const adminCount = await tx.userRole.count({
            where: { role: "ADMIN" },
          });

          if (adminCount > 0) {
            return;
          }

          await tx.userRole.upsert({
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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return;
    } catch (error) {
      if (
        attempt === INITIAL_ADMIN_BOOTSTRAP_ATTEMPTS ||
        !isPrismaSerializationConflict(error)
      ) {
        throw error;
      }
    }
  }
}

function isPrismaSerializationConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
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
