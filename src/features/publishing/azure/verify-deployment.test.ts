import { describe, expect, it, vi } from "vitest";

import { verifyPublishedUrl } from "./verify-deployment";

describe("verifyPublishedUrl", () => {
  it("accepts 200 responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).resolves.toEqual({ verifiedAt: expect.any(Date) });
  });

  it("accepts auth redirect responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://login.microsoftonline.com/tenant" },
      }),
    );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).resolves.toEqual({ verifiedAt: expect.any(Date) });
  });

  it("rejects redirects to unrelated hosts with microsoft login in the query", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://example.com/?next=login.microsoftonline.com",
        },
      }),
    );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).rejects.toThrow(/did not return a healthy response/);
  });

  it.each([
    "http://login.microsoftonline.com/tenant",
    "https://login.microsoftonline.com:444/tenant",
  ])("rejects an insecure Microsoft login redirect to %s", async (location) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location },
      }),
    );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).rejects.toThrow(/did not return a healthy response/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(["/login", "/api/auth/signin?callbackUrl=%2F"])(
    "verifies the public health endpoint after a protected app redirects to %s",
    async (location) => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 307,
            headers: { location },
          }),
        )
        .mockResolvedValueOnce(new Response("ok", { status: 200 }));

      await expect(
        verifyPublishedUrl("https://app.example.test", { fetchImpl }),
      ).resolves.toEqual({ verifiedAt: expect.any(Date) });
      expect(fetchImpl).toHaveBeenNthCalledWith(
        2,
        "https://app.example.test/api/health",
        { method: "GET", redirect: "manual" },
      );
    },
  );

  it("rejects a same-origin login redirect when the public health endpoint is unhealthy", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/login" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("Application Error", { status: 500 }),
      );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).rejects.toThrow(/health endpoint.*Status: 500/i);
  });

  it("does not probe health after an external redirect", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://attacker.example/login" },
      }),
    );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).rejects.toThrow(/did not return a healthy response/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    "/moved",
    "http://app.example.test/login",
    "https://app.example.test:444/login",
  ])("does not probe health after an untrusted app redirect to %s", async (location) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location },
      }),
    );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).rejects.toThrow(/did not return a healthy response/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects runtime error pages", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("Application Error", { status: 500 }),
    );

    await expect(
      verifyPublishedUrl("https://app.example.test", { fetchImpl }),
    ).rejects.toThrow(/did not return a healthy response/);
  });

  it("checks the published URL without following redirects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await verifyPublishedUrl("https://app.example.test", { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith("https://app.example.test", {
      method: "GET",
      redirect: "manual",
    });
  });
});
