import { z, type ZodTypeAny } from "zod";
import { PortalApiError } from "@/features/portal-api/errors";

export const getAppEnvironmentSchema = z.object({
  appId: z.string().min(1).max(128),
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(100).default(25),
}).strict();

export const setAppEnvironmentSchema = z.object({
  appId: z.string().min(1).max(128),
  variables: z.array(z.object({
    key: z.string().min(1).max(128),
    value: z.string().max(4096),
  }).strict()).min(1).max(100),
  idempotencyKey: z.string().uuid(),
}).strict();

export type GetAppEnvironmentInput = z.input<typeof getAppEnvironmentSchema>;
export type SetAppEnvironmentInput = z.infer<typeof setAppEnvironmentSchema>;

export function parseEnvironmentInput<T extends ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new PortalApiError("INVALID_INPUT", "Invalid environment settings request.");
  }
  return result.data;
}
