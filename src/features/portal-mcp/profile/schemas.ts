import { z } from "zod";
import { PortalApiError } from "@/features/portal-api/errors";
import { githubUsernameSchema } from "@/features/repositories/access";

export const getMyProfileSchema = z.object({}).strict();
// JSON Schema validates before Zod can trim or normalize. Keep the wire
// representation bounded, then apply the shared username rules in the handler.
export const setMyGitHubUsernameInputSchema = z.object({
  githubUsername: z.string().min(1).max(100),
  idempotencyKey: z.string().uuid(),
}).strict();
export const setMyGitHubUsernameSchema = setMyGitHubUsernameInputSchema.extend({
  githubUsername: githubUsernameSchema.transform((value) => value.toLowerCase()),
});

export function parseProfileInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new PortalApiError("INVALID_INPUT", "Check the profile tool arguments and GitHub username.");
  }
  return result.data;
}
