import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PortalApiError } from "@/features/portal-api/errors";
import {
  portalMcpInputSchema,
  portalToolFailure,
  portalToolSuccess,
} from "./result";

describe("portal MCP tool results", () => {
  it("returns short text and structured data for successful calls", () => {
    expect(
      portalToolSuccess(
        { requestId: "request-1", status: "READY" },
        "The app is ready.",
      ),
    ).toEqual({
      content: [{ type: "text", text: "The app is ready." }],
      structuredContent: { requestId: "request-1", status: "READY" },
    });
  });

  it("returns only the stable safe error contract for known failures", () => {
    expect(
      portalToolFailure(
        new PortalApiError(
          "RATE_LIMITED",
          "Too many requests. Try again after the retry period.",
          42,
        ),
      ),
    ).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "Too many requests. Try again after the retry period.",
        },
      ],
      structuredContent: {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again after the retry period.",
        retryAfterSeconds: 42,
      },
    });
  });

  it("never serializes raw provider details from unknown failures", () => {
    const providerFailure = new Error(
      "Bearer TEST_TOKEN; client_secret=TEST_SECRET; Azure raw provider message",
    );
    providerFailure.stack = "STACK_TRACE_WITH_TEST_SECRET";

    const serialized = JSON.stringify(portalToolFailure(providerFailure));

    expect(serialized).toContain("PROVIDER_FAILURE");
    expect(serialized).toContain("The portal could not complete this operation.");
    expect(serialized).not.toContain("TEST_TOKEN");
    expect(serialized).not.toContain("TEST_SECRET");
    expect(serialized).not.toContain("STACK_TRACE");
    expect(serialized).not.toContain("Azure raw provider message");
  });

  it("adapts strict Zod 3 schemas to the handler's JSON-capable standard schema", async () => {
    const schema = portalMcpInputSchema(
      z
        .object({
          idempotencyKey: z.string().uuid(),
          appId: z.string().min(1),
        })
        .strict(),
    );

    expect(
      schema["~standard"].jsonSchema.input({ target: "draft-2020-12" }),
    ).toMatchObject({
      type: "object",
      required: ["idempotencyKey", "appId"],
      additionalProperties: false,
      properties: {
        idempotencyKey: { type: "string", format: "uuid" },
        appId: { type: "string", minLength: 1 },
      },
    });
    expect(
      await schema["~standard"].validate({
        idempotencyKey: "53b6240b-2f6f-4ab8-bf70-3458b861bf3f",
        appId: "app-1",
      }),
    ).toMatchObject({ value: { appId: "app-1" } });
    expect(
      await schema["~standard"].validate({
        idempotencyKey: "not-a-uuid",
        appId: "app-1",
        extra: true,
      }),
    ).toMatchObject({ issues: expect.any(Array) });
  });
});
