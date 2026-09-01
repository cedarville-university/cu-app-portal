import {
  fromJsonSchema,
  type JsonSchemaType,
  type StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import { z, type ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { toSafePortalApiError } from "@/features/portal-api/errors";

export type PortalToolTextContent = {
  type: "text";
  text: string;
};

export type PortalToolSuccessResult<T extends Record<string, unknown>> = {
  content: PortalToolTextContent[];
  structuredContent: T;
};

export type PortalToolFailureResult = {
  isError: true;
  content: PortalToolTextContent[];
  structuredContent: ReturnType<typeof toSafePortalApiError>;
};

export function portalMcpInputSchema<TSchema extends ZodTypeAny>(
  schema: TSchema,
): StandardSchemaWithJSON<z.input<TSchema>, z.output<TSchema>> {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  });
  return fromJsonSchema<z.output<TSchema>>(jsonSchema as JsonSchemaType);
}

export function portalToolSuccess<T extends Record<string, unknown>>(
  data: T,
  text: string,
): PortalToolSuccessResult<T> {
  return {
    content: [{ type: "text", text }],
    structuredContent: data,
  };
}

export function portalToolFailure(error: unknown): PortalToolFailureResult {
  const safeError = toSafePortalApiError(error);
  return {
    isError: true,
    content: [{ type: "text", text: safeError.message }],
    structuredContent: safeError,
  };
}
