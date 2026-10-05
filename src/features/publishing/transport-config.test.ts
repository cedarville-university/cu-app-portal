// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadPublishTransportConfig } from "./transport-config";

describe("publishing transport", () => {
  it("uses a separate database worker in development", () => {
    expect(loadPublishTransportConfig({ NODE_ENV: "development" })).toEqual({ transport: "database" });
  });
  it("disables unconfigured production publishing and rejects the development transport", () => {
    expect(loadPublishTransportConfig({ NODE_ENV: "production" })).toEqual({ transport: "disabled" });
    expect(() => loadPublishTransportConfig({ NODE_ENV: "production", PUBLISH_TRANSPORT: "database" })).toThrow("service-bus in production");
  });
  it("requires a complete Service Bus configuration", () => {
    expect(() => loadPublishTransportConfig({ PUBLISH_TRANSPORT: "service-bus" })).toThrow("are required");
    expect(loadPublishTransportConfig({ PUBLISH_TRANSPORT: "service-bus", PUBLISH_SERVICE_BUS_NAMESPACE: "portal.servicebus.windows.net", PUBLISH_SERVICE_BUS_QUEUE: "publishing" })).toEqual({ transport: "service-bus", fullyQualifiedNamespace: "portal.servicebus.windows.net", queueName: "publishing" });
  });
});
