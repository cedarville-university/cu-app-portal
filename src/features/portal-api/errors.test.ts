import { describe, expect, it } from "vitest";
import { PortalApiError, toSafePortalApiError } from "./errors";

describe("portal API errors", () => {
  it("preserves stable safe errors", () => {
    expect(toSafePortalApiError(new PortalApiError("NOT_FOUND", "App not found."))).toEqual({
      code: "NOT_FOUND",
      message: "App not found.",
      retryAfterSeconds: null,
    });
  });

  it("hides unknown exceptions", () => {
    expect(toSafePortalApiError(new Error("Azure secret: abc"))).toEqual({
      code: "PROVIDER_FAILURE",
      message: "The portal could not complete this operation.",
      retryAfterSeconds: null,
    });
  });
});
