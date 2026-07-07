import { AUDIT_EVENTS, type AuditEvent } from "@/lib/audit";

export const ADMIN_PAGE_SIZE = 25;

type ParamValue = string | string[] | undefined;

function single(value: ParamValue): string | null {
  return typeof value === "string" ? value : null;
}

export function parsePage(value: ParamValue): number {
  const raw = single(value);

  if (!raw || !/^\d+$/.test(raw)) {
    return 1;
  }

  const page = Number.parseInt(raw, 10);

  return page >= 1 ? page : 1;
}

export function totalPages(totalCount: number, pageSize = ADMIN_PAGE_SIZE) {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

export function clampPage(
  page: number,
  totalCount: number,
  pageSize = ADMIN_PAGE_SIZE,
) {
  return Math.min(Math.max(1, page), totalPages(totalCount, pageSize));
}

export function parseSearch(value: ParamValue): string | null {
  const raw = single(value)?.trim();

  return raw ? raw : null;
}

export function parseAuditEventFilter(value: ParamValue): AuditEvent | null {
  const raw = single(value);

  if (raw && (AUDIT_EVENTS as readonly string[]).includes(raw)) {
    return raw as AuditEvent;
  }

  return null;
}

export function parseDateFilter(
  value: ParamValue,
  boundary: "start" | "end",
): Date | null {
  const raw = single(value);

  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }

  const time = boundary === "start" ? "00:00:00" : "23:59:59.999";
  const date = new Date(`${raw}T${time}`);

  return Number.isNaN(date.getTime()) ? null : date;
}
