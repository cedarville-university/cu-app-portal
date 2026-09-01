import { createHash } from "node:crypto";

function normalizeStableJson(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Stable JSON requires finite numbers.");
    return value;
  }

  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new TypeError(`Stable JSON cannot represent ${typeof value}.`);
  }

  if (typeof value !== "object") {
    throw new TypeError("Stable JSON received an unsupported value.");
  }

  if (ancestors.has(value)) throw new TypeError("Stable JSON cannot represent cyclic values.");
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeStableJson(item, ancestors));
    }

    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new TypeError("Stable JSON requires plain objects.");
    }

    const objectValue = value as Record<string, unknown>;
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(objectValue).sort()) {
      result[key] = normalizeStableJson(objectValue[key], ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export function stableJson(value: unknown): string {
  return JSON.stringify(normalizeStableJson(value));
}

export async function sha256StableJson(value: unknown): Promise<string> {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

export function stableJsonValue(value: unknown): unknown {
  return normalizeStableJson(value);
}
