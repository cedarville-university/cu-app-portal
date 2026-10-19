import { describe, expect, it, vi } from "vitest";

import { verifyPublishedUrl } from "./verify-deployment";

describe("verifyPublishedUrl", () => {
  it("accepts the fixed public health endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).resolves.toEqual({ verifiedAt: expect.any(Date) });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://app.example.test/api/health",
      { method: "GET", redirect: "manual", cache: "no-store", signal: expect.any(AbortSignal) },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([404, 500, 302])("publishes with a warning when health returns %i but root returns 200", async (status) => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(new Response("App", { status: 200 }));

    const result = await verifyPublishedUrl("https://app.example.test/nested", { fetchImpl });
    expect(result).toEqual({ verifiedAt: expect.any(Date), warningSummary: expect.stringContaining("/api/health") });
    if (status === 404) expect(result.warningSummary).toMatch(/missing/i);
    if (status === 500) expect(result.warningSummary).toContain("500");
    expect(fetchImpl).toHaveBeenLastCalledWith("https://app.example.test/", {
      method: "GET", redirect: "manual", cache: "no-store", signal: expect.any(AbortSignal),
    });
  });

  it("accepts root 200 after a health network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response("App", { status: 200 }));
    await expect(verifyPublishedUrl("https://app.example.test", { fetchImpl }))
      .resolves.toEqual({ verifiedAt: expect.any(Date), warningSummary: expect.stringContaining("could not be reached") });
  });

  it.each([302, 404, 500])("rejects a missing health route when root returns %i", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status }));
    await expect(verifyPublishedUrl("https://app.example.test", { fetchImpl })).rejects.toThrow(/health endpoint/i);
  });

  it("rejects when both probes fail to connect", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(verifyPublishedUrl("https://app.example.test", { fetchImpl })).rejects.toThrow();
  });

  it.each([302, 500])("rejects a non-200 health response (%i)", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status }));

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).rejects.toThrow(new RegExp(`health endpoint.*Status: ${status}`, "i"));
  });

  it("does not follow a health endpoint redirect", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://attacker.example/health" },
      }),
    );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).rejects.toThrow(/health endpoint.*Status: 302/i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
