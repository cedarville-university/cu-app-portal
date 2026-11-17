import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Use this client only in server-side tools. Each tool must authorize its own
// rows/actions using the validated MCP principal. The database connection does
// not grant the caller access to every record.
