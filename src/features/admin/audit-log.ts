import { Prisma } from "@prisma/client";
import type { AuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { AUDIT_USER_ID_KEYS, AUDIT_ENTRA_OID_KEYS } from "./audit-log-references";

export type AuditLogFilters = {
  event: AuditEvent | null;
  from: Date | null;
  to: Date | null;
  search: string | null;
  hideSystem?: boolean;
};

export type AuditLogEntry = {
  id: string;
  event: string;
  details: unknown;
  createdAt: Date;
};

function whereClause(filters: AuditLogFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (filters.hideSystem) {
    // Match the displayed username: prefer saved context, then identity fields
    // on legacy records. Filter before LIMIT and COUNT so paging stays accurate.
    const identityFields = [...AUDIT_USER_ID_KEYS, ...AUDIT_ENTRA_OID_KEYS].map(
      (key) => Prisma.sql`COALESCE(jsonb_typeof("details" -> ${key}) = 'string', false)`,
    );
    conditions.push(Prisma.sql`(
      CASE
        WHEN jsonb_typeof("details" -> ${"username"}) = 'string'
          AND "details" ->> ${"username"} <> ''
          THEN "details" ->> ${"username"}
        WHEN (${Prisma.join(identityFields, " OR ")}) THEN 'Unknown user'
        ELSE 'System'
      END
    ) <> ${"System"}`);
  }

  if (filters.event) {
    conditions.push(Prisma.sql`"event" = ${filters.event}`);
  }

  if (filters.from) {
    conditions.push(Prisma.sql`"createdAt" >= ${filters.from}`);
  }

  if (filters.to) {
    conditions.push(Prisma.sql`"createdAt" <= ${filters.to}`);
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      Prisma.sql`("event" ILIKE ${pattern} OR "details"::text ILIKE ${pattern})`,
    );
  }

  if (conditions.length === 0) {
    return Prisma.empty;
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

export async function searchAuditLog(
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
): Promise<{ entries: AuditLogEntry[]; totalCount: number }> {
  const where = whereClause(filters);
  const offset = (page - 1) * pageSize;

  const [entries, countRows] = await Promise.all([
    prisma.$queryRaw<AuditLogEntry[]>(
      Prisma.sql`SELECT "id", "event", "details", "createdAt" FROM "AuditLog" ${where} ORDER BY "createdAt" DESC LIMIT ${pageSize} OFFSET ${offset}`,
    ),
    prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "AuditLog" ${where}`,
    ),
  ]);

  return {
    entries,
    totalCount: Number(countRows[0]?.count ?? BigInt(0)),
  };
}

const SUMMARY_MAX_LENGTH = 120;

export function summarizeDetails(
  details: unknown,
  labelFor?: (key: string, value: unknown) => string | null,
): string {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return "";
  }

  const summary = Object.entries(details)
    .slice(0, 3)
    .map(([key, value]) => {
      const label = labelFor?.(key, value) ?? null;
      const text =
        label ?? (typeof value === "string" ? value : JSON.stringify(value));
      return `${key}: ${text}`;
    })
    .join(", ");

  if (summary.length <= SUMMARY_MAX_LENGTH) {
    return summary;
  }

  return `${summary.slice(0, SUMMARY_MAX_LENGTH - 3)}...`;
}
