import { loadPortalApiConfig } from "@/features/portal-api/config";
import {
  PortalApiError,
  toSafePortalApiError,
} from "@/features/portal-api/errors";
import { authenticatePortalApiRequest } from "@/features/portal-api/principal";
import { createPortalMcpHandler } from "@/features/portal-mcp/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
};

function withTransportHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  for (const [name, value] of Object.entries(corsHeaders)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function errorResponse(
  error: unknown,
  status: number,
  wwwAuthenticate?: string,
) {
  const safeError = toSafePortalApiError(error);
  const headers = new Headers({ "Content-Type": "application/json" });
  if (wwwAuthenticate) headers.set("WWW-Authenticate", wwwAuthenticate);

  return withTransportHeaders(
    new Response(JSON.stringify({ error: safeError }), { status, headers }),
  );
}

function protectedResourceMetadataUrl(resourceUrl: string) {
  return new URL(
    "/.well-known/oauth-protected-resource",
    resourceUrl,
  ).toString();
}

async function handle(request: Request) {
  try {
    const { actor } = await authenticatePortalApiRequest(request);
    const response = await createPortalMcpHandler(actor)(request);
    return withTransportHeaders(response);
  } catch (error) {
    if (error instanceof PortalApiError && error.code === "NOT_FOUND") {
      return errorResponse(error, 404);
    }

    if (
      error instanceof PortalApiError &&
      error.code === "AUTHENTICATION_REQUIRED"
    ) {
      try {
        const config = loadPortalApiConfig();
        if (!config.enabled) {
          return errorResponse(
            new PortalApiError("NOT_FOUND", "Not found."),
            404,
          );
        }
        const challenge = `Bearer error="invalid_token", resource_metadata="${protectedResourceMetadataUrl(config.resourceUrl)}"`;
        return errorResponse(error, 401, challenge);
      } catch {
        return errorResponse(
          new PortalApiError(
            "PROVIDER_FAILURE",
            "The portal could not complete this operation.",
          ),
          500,
        );
      }
    }

    return errorResponse(error, 500);
  }
}

export { handle as GET, handle as POST, handle as DELETE };
