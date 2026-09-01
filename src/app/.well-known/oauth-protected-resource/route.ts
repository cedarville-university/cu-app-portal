import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler";
import { loadPortalApiConfig } from "@/features/portal-api/config";
import {
  PortalApiError,
  toSafePortalApiError,
} from "@/features/portal-api/errors";

function withNoStore(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function quietError(error: unknown, status: number) {
  return withNoStore(
    Response.json(
      { error: toSafePortalApiError(error) },
      { status },
    ),
  );
}

export async function GET(request: Request) {
  try {
    const config = loadPortalApiConfig();
    if (!config.enabled) {
      return quietError(
        new PortalApiError("NOT_FOUND", "Not found."),
        404,
      );
    }

    const baseResponse = protectedResourceHandler({
      authServerUrls: [config.issuer],
      resourceUrl: config.resourceUrl,
    })(request);
    const metadata = (await baseResponse.json()) as Record<string, unknown>;
    const headers = new Headers(baseResponse.headers);
    headers.set("Content-Type", "application/json");
    return withNoStore(
      new Response(
        JSON.stringify({
          ...metadata,
          scopes_supported: [config.requiredScope],
        }),
        { status: baseResponse.status, headers },
      ),
    );
  } catch (error) {
    return quietError(error, 500);
  }
}

export async function OPTIONS() {
  return withNoStore(metadataCorsOptionsRequestHandler()());
}
