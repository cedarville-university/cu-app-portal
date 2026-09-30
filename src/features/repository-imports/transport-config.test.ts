// @vitest-environment node

import { describe, expect, it } from "vitest";
import { loadRepositoryImportTransportConfig } from "./transport-config";

describe("loadRepositoryImportTransportConfig", () => {
  it("rejects inline transport in production", () => {
    expect(() =>
      loadRepositoryImportTransportConfig(
        { REPOSITORY_IMPORT_TRANSPORT: "inline" },
        "production",
      ),
    ).toThrow(/inline repository imports are not allowed in production/i);
  });

  it("accepts disabled transport in production", () => {
    expect(
      loadRepositoryImportTransportConfig(
        { REPOSITORY_IMPORT_TRANSPORT: "disabled" },
        "production",
      ),
    ).toEqual({ transport: "disabled" });
  });

  it("requires a fully qualified namespace and queue for service bus", () => {
    expect(() =>
      loadRepositoryImportTransportConfig(
        { REPOSITORY_IMPORT_TRANSPORT: "service-bus" },
        "production",
      ),
    ).toThrow(/REPOSITORY_IMPORT_SERVICE_BUS_NAMESPACE/i);

    expect(() =>
      loadRepositoryImportTransportConfig(
        {
          REPOSITORY_IMPORT_TRANSPORT: "service-bus",
          REPOSITORY_IMPORT_SERVICE_BUS_NAMESPACE:
            "cu-imports.servicebus.windows.net",
        },
        "production",
      ),
    ).toThrow(/REPOSITORY_IMPORT_SERVICE_BUS_QUEUE/i);

    expect(
      loadRepositoryImportTransportConfig(
        {
          REPOSITORY_IMPORT_TRANSPORT: "service-bus",
          REPOSITORY_IMPORT_SERVICE_BUS_NAMESPACE:
            "cu-imports.servicebus.windows.net",
          REPOSITORY_IMPORT_SERVICE_BUS_QUEUE: "repository-imports",
        },
        "production",
      ),
    ).toEqual({
      transport: "service-bus",
      fullyQualifiedNamespace: "cu-imports.servicebus.windows.net",
      queueName: "repository-imports",
    });
  });

  it("allows inline only outside production", () => {
    expect(
      loadRepositoryImportTransportConfig(
        { REPOSITORY_IMPORT_TRANSPORT: "inline" },
        "development",
      ),
    ).toEqual({ transport: "inline" });
    expect(loadRepositoryImportTransportConfig({}, "test")).toEqual({
      transport: "inline",
    });
  });

  it("defaults production to disabled", () => {
    expect(loadRepositoryImportTransportConfig({}, "production")).toEqual({
      transport: "disabled",
    });
  });
});
