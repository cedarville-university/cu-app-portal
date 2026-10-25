import { z } from "zod";
import { PortalApiError } from "@/features/portal-api/errors";
const offset = z.number().int().min(0).max(20 * 1024 * 1024);
const id = z.string().min(1).max(128);
const schema = z.object({
  version: z.literal(1), appId: id, attemptId: id.nullable(), targetKey: z.string().regex(/^[a-f0-9]{64}$/), source: z.enum(["github", "azure", "both"]), logKind: z.enum(["deployment", "runtime", "both"]), maxLines: z.number().int().min(1).max(1000), github: z.object({
    page: z.number().int().min(1).max(10000), index: z.number().int().min(0).max(99), offset, jobId: z.string().regex(/^\d+$/).optional()
  }).strict().nullable(), azure: z.object({ deployment: z.object({ id: id.optional(), offset }).strict().nullable(), runtime: z.object({ offset }).strict().nullable() }).strict().nullable()
}).strict();
export type LogCursorState = z.infer<typeof schema>;
const invalid = () => new PortalApiError("INVALID_INPUT", "Invalid or outdated log continuation cursor.");
export function encodeLogCursor(state: LogCursorState): string { return Buffer.from(JSON.stringify(schema.parse(state))).toString("base64url"); }
export function decodeLogCursor(value: string): LogCursorState {
  if (value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw invalid();
  try {
    return schema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  }
  catch {
    throw invalid();
  }
}
