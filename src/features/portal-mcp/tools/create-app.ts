import { z } from "zod";
import { createAppSchema } from "@/features/create-app/validation";
import { PortalApiError } from "@/features/portal-api/errors";
import {
  portalMcpInputSchema,
  portalToolFailure,
  portalToolSuccess,
} from "../result";
import type { PortalMcpServer, PortalMcpToolContext } from "../server";

const IDEMPOTENCY_TTL_SECONDS = 604800;

export const createAppToolInputSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    templateSlug: z.string().min(1).max(100),
    appName: z.string().max(100),
    description: z.string().max(2000),
    databaseProvider: z.enum(["none", "postgresql"]),
    entraLogin: z.boolean(),
    publicAcknowledgement: z.literal(true).optional(),
  })
  .strict();

const createAppMcpInputSchema = portalMcpInputSchema(
  createAppToolInputSchema,
);

type CreateAppToolInput = z.infer<typeof createAppToolInputSchema>;

export function registerCreateAppTool(
  server: PortalMcpServer,
  context: PortalMcpToolContext,
) {
  server.registerTool(
    "create_app",
    {
      title: "Create App",
      description:
        "Create a template-backed app and private managed repository. This never publishes to Azure.",
      inputSchema: createAppMcpInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (input: CreateAppToolInput) => {
      try {
        const template = context.getActiveTemplateBySlug(input.templateSlug);
        if (!template) {
          throw new PortalApiError(
            "INVALID_INPUT",
            "Choose an active Cedarville app template.",
          );
        }

        const candidate = {
          appName: input.appName,
          description: input.description,
          hostingTarget: template.hostingTarget,
          databaseProvider: input.databaseProvider,
          entraLogin: input.entraLogin,
          ...(input.publicAcknowledgement === true
            ? { publicAcknowledgement: true as const }
            : {}),
        };
        const validated = createAppSchema({
          hostingTarget: template.hostingTarget,
          features: template.features,
          requirePublicAcknowledgement: true,
        }).safeParse(candidate);
        if (!validated.success) {
          throw new PortalApiError(
            "INVALID_INPUT",
            validated.error.issues[0]?.message ?? "Check the app creation choices.",
          );
        }

        const mutationInput = {
          templateSlug: input.templateSlug,
          appName: validated.data.appName,
          description: validated.data.description,
          databaseProvider: validated.data.databaseProvider,
          entraLogin: validated.data.entraLogin,
          ...(validated.data.publicAcknowledgement
            ? { publicAcknowledgement: true as const }
            : {}),
        };
        const result = await context.executeIdempotentMutation({
          actorUserId: context.actor.userId,
          operation: "create_app",
          idempotencyKey: input.idempotencyKey,
          input: mutationInput,
          expiresInSeconds: IDEMPOTENCY_TTL_SECONDS,
          claimRateLimit: () =>
            context.claimPortalRateLimit(context.actor.userId, "create_app"),
          execute: async () => {
            const creation = await context.createGeneratedApp({
              actorUserId: context.actor.userId,
              source: "codex-mcp",
              input: {
                ...mutationInput,
                hostingTarget: template.hostingTarget,
              },
            });
            const app = await context.getAccessibleAppSummary(
              context.actor,
              creation.requestId,
            );
            return {
              ...creation,
              allowedNextActions: app.allowedNextActions,
            };
          },
        });

        return portalToolSuccess(
          result,
          result.repositoryStatus === "READY"
            ? "The app and managed repository are ready. The app has not been published."
            : "The app record was created, but the managed repository needs attention. The app has not been published.",
        );
      } catch (error) {
        return portalToolFailure(error);
      }
    },
  );
}
