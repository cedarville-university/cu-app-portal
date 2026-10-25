import { z, type ZodTypeAny } from "zod";
import { PortalApiError } from "@/features/portal-api/errors";
const id = z.string().trim().min(1).max(128);
const page = {
  query: z.string().trim().max(200).optional(), offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 101).default(0), limit: z.number().int().min(1).max(100).default(25)
};
export const adminListAppsSchema = z.object({ ...page, ownerUserId: id.optional() }).strict();
export const adminFindUsersSchema = z.object(page).strict();
export const adminDebugAppSchema = z.object({ appId: id }).strict();
export const adminGetAppLogsSchema = z.object({
  appId: id, attemptId: id.optional(), source: z.enum(["github", "azure", "both"]).default("both"), logKind: z.enum(["deployment", "runtime", "both"]).default("both"), maxLines: z.number().int().min(1).max(1000).default(200), cursor: z.string().min(1).max(4096).optional()
}).strict();
export type AdminListAppsInput = z.input<typeof adminListAppsSchema>;
export type AdminFindUsersInput = z.input<typeof adminFindUsersSchema>;
export type AdminDebugAppInput = z.input<typeof adminDebugAppSchema>;
export type AdminGetAppLogsInput = z.input<typeof adminGetAppLogsSchema>;
export function parseAdminInput<T extends ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new PortalApiError("INVALID_INPUT", "Invalid administrative action input.");
  return parsed.data;
}
