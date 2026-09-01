export type PortalApiErrorCode =
  | "INVALID_INPUT"
  | "AUTHENTICATION_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ACTION_REQUIRED"
  | "SETUP_REPAIR_REQUIRED"
  | "RATE_LIMITED"
  | "PROVIDER_FAILURE";

export type SafePortalApiError = {
  code: PortalApiErrorCode;
  message: string;
  retryAfterSeconds: number | null;
};

export class PortalApiError extends Error {
  constructor(
    readonly code: PortalApiErrorCode,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "PortalApiError";
  }
}

export function toSafePortalApiError(error: unknown): SafePortalApiError {
  if (error instanceof PortalApiError) {
    return {
      code: error.code,
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }

  return {
    code: "PROVIDER_FAILURE",
    message: "The portal could not complete this operation.",
    retryAfterSeconds: null,
  };
}
