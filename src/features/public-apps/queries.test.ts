import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { listPublicApps } from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listPublicApps", () => {
  it("returns only publicly listed apps with name, description, and link", async () => {
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req-1",
        appName: "Campus Dashboard",
        submittedConfig: { description: "Live campus stats." },
        publishUrl: "https://dashboard.example.edu",
        primaryPublishUrl: "https://app-dashboard.azurewebsites.net",
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);

    const apps = await listPublicApps();

    expect(prisma.appRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isPubliclyListed: true },
      }),
    );
    expect(apps).toEqual([
      {
        id: "req-1",
        name: "Campus Dashboard",
        description: "Live campus stats.",
        url: "https://dashboard.example.edu",
      },
    ]);
  });

  it("falls back to the primary publish URL when no custom publish URL is set", async () => {
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req-2",
        appName: "Chapel Signup",
        submittedConfig: { description: "Sign up for chapel seats." },
        publishUrl: null,
        primaryPublishUrl: "https://app-chapel.azurewebsites.net",
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);

    const apps = await listPublicApps();

    expect(apps[0].url).toBe("https://app-chapel.azurewebsites.net");
  });

  it("handles apps without a description or link", async () => {
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req-3",
        appName: "Intramural Scores",
        submittedConfig: null,
        publishUrl: null,
        primaryPublishUrl: null,
      },
      {
        id: "req-4",
        appName: "Lost and Found",
        submittedConfig: { description: "   " },
        publishUrl: null,
        primaryPublishUrl: null,
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);

    const apps = await listPublicApps();

    expect(apps[0].description).toBeNull();
    expect(apps[0].url).toBeNull();
    expect(apps[1].description).toBeNull();
  });
});
