import React from "react";

export type BadgeVariant = "success" | "error" | "warning" | "info" | "default";

export function formatStatus(status: string | null | undefined) {
  if (!status) return "Not checked";

  return status.toLowerCase().replaceAll("_", " ");
}

export function statusVariant(status: string | null | undefined): BadgeVariant {
  const normalized = status?.toLowerCase();

  if (
    normalized === "ready" ||
    normalized === "succeeded" ||
    normalized === "completed" ||
    normalized === "granted"
  ) {
    return "success";
  }
  if (normalized === "failed" || normalized === "blocked") return "error";
  if (
    normalized === "queued" ||
    normalized === "pending" ||
    normalized === "provisioning" ||
    normalized === "deploying"
  ) {
    return "warning";
  }
  if (normalized === "deleted" || normalized === "not_started") {
    return "default";
  }

  return "info";
}

export function StatusBadge({ label, status }: { label: string; status: string }) {
  return (
    <span className={`badge badge--${statusVariant(status)}`}>
      {label}: {formatStatus(status)}
    </span>
  );
}

export function userLabel(user: { displayName: string; email: string }) {
  return `${user.displayName} (${user.email})`;
}

export function createdDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
