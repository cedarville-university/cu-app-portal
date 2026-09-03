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
      { method: "GET", redirect: "manual" },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
