// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { readDependencyReview } from "@/features/security-review/update-service";
import { prisma } from "@/lib/db";
import { GET, POST } from "./route";

vi.mock("@/features/app-requests/current-user", () => ({ getCurrentUserIdOrNull: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: { findFirst: vi.fn() },
    appRequest: { findFirst: vi.fn() },
    appDependencyReview: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("@/features/security-review/update-service", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/security-review/update-service")>(),
  readDependencyReview: vi.fn(),
}));

const repository = "https://github.com/example/fixture";
const app = { repositoryUrl: repository, repositoryStatus: "READY", repositoryOwner: "example", repositoryName: "fixture" };
const dependency = { checkedAt: "2026-11-24T12:00:00Z", alerts: [], updates: [] };
const requestContext = { params: Promise.resolve({ requestId: "app-123" }) };
const url = "https://launch.example.org/api/apps/app-123/security-review";

beforeEach(() => {
  vi.stubEnv("DEPENDABOT_REVIEW_REPOSITORIES", "example/fixture");
  vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("actor");
  vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.appDependencyReview.findUnique).mockResolvedValue(null);
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it("requires a session before looking up an app or contacting GitHub", async () => {
  vi.mocked(getCurrentUserIdOrNull).mockResolvedValue(null);
  expect((await GET(new Request(url), requestContext)).status).toBe(401);
  expect((await POST(new Request(url, { method: "POST" }), requestContext)).status).toBe(401);
  expect(prisma.appRequest.findFirst).not.toHaveBeenCalled();
  expect(readDependencyReview).not.toHaveBeenCalled();
});

it("uses the details page access rules and does not query GitHub for an inaccessible app", async () => {
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);
  expect((await GET(new Request(url), requestContext)).status).toBe(404);
  expect(prisma.appRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      id: "app-123",
      OR: [{ userId: "actor" }, { collaborators: { some: { userId: "actor" } } }],
      publishStatus: { in: ["SUCCEEDED", "FAILED"] },
    },
  }));
  expect(readDependencyReview).not.toHaveBeenCalled();
});

it("returns a private review only for the app's enrolled repository", async () => {
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(app as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
  vi.mocked(readDependencyReview).mockResolvedValue(dependency);
  const response = await GET(new Request(url), requestContext);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ repository, dependency });
  expect(readDependencyReview).toHaveBeenCalledWith({ owner: "example", name: "fixture" }, expect.any(AbortSignal));
  expect(prisma.appDependencyReview.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { appRequestId_repository: { appRequestId: "app-123", repository } },
    create: { appRequestId: "app-123", repository, checkedAt: new Date(dependency.checkedAt), dependency },
    update: { checkedAt: new Date(dependency.checkedAt), dependency },
  }));

  vi.stubEnv("DEPENDABOT_REVIEW_REPOSITORIES", "");
  expect((await GET(new Request(url), requestContext)).status).toBe(404);
  expect(readDependencyReview).toHaveBeenCalledTimes(1);
});

it("reuses fresh data across requests and lets a manual refresh bypass it", async () => {
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(app as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
  const recentlyChecked = { ...dependency, checkedAt: new Date().toISOString() };
  vi.mocked(prisma.appDependencyReview.findUnique).mockResolvedValue({
    appRequestId: "app-123", repository, checkedAt: new Date(recentlyChecked.checkedAt), dependency: recentlyChecked,
  });
  const result = await GET(new Request(url), requestContext);
  expect(await result.json()).toEqual({ repository, dependency: recentlyChecked });
  expect(readDependencyReview).not.toHaveBeenCalled();

  vi.mocked(readDependencyReview).mockResolvedValue(recentlyChecked);
  const refreshed = await POST(new Request(url, { method: "POST" }), requestContext);
  expect(refreshed.status).toBe(200);
  expect(readDependencyReview).toHaveBeenCalledTimes(1);
  expect(prisma.appDependencyReview.upsert).toHaveBeenCalledOnce();
});

it("bounds the whole GitHub lookup and returns a retryable error on timeout", async () => {
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(app as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(deadline.signal);
  try {
    vi.mocked(prisma.appDependencyReview.findUnique).mockResolvedValue({
      appRequestId: "app-123", repository, checkedAt: new Date(dependency.checkedAt), dependency,
    });
    vi.mocked(readDependencyReview).mockImplementationOnce(async (_repo, signal) => {
      deadline.abort(new DOMException("Timed out", "TimeoutError"));
      signal?.throwIfAborted();
      return dependency;
    });
    const response = await GET(new Request(url), requestContext);
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(response.status).toBe(504);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(prisma.appDependencyReview.upsert).not.toHaveBeenCalled();
  } finally {
    timeout.mockRestore();
  }
});
