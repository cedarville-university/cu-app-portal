import { z } from "zod";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
export const securityUpdate = z.object({
  number: z.number().int().positive(),
  head: sha,
  base: sha,
  branch: z.string().min(1),
  alerts: z.array(z.number().int().positive()).min(1),
  checks: z.enum(["passed", "failed", "pending", "unavailable"]),
  checkSource: z.enum(["actions", "rollup"]).optional(),
  checkNames: z.array(z.string()),
  ready: z.boolean(),
});
export type SecurityUpdate = z.infer<typeof securityUpdate>;
export const checkLabels: Record<SecurityUpdate["checks"], string> = {
  passed: "Checks passed", failed: "Checks failed", pending: "Checks in progress", unavailable: "No verified test results",
};
