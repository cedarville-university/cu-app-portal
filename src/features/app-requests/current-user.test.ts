import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.hoisted(() => vi.fn());
const prismaUserUpsertMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/session", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      upsert: prismaUserUpsertMock,
    },
  },
}));

describe("getCurrentUserIdOrNull", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    getServerSessionMock.mockReset();
    prismaUserUpsertMock.mockReset();
  });

  it("uses the fallback e2e user when bypass mode is enabled outside production", async () => {
    vi.stubEnv("E2E_AUTH_BYPASS", "true");
    getServerSessionMock.mockResolvedValue(null);
    prismaUserUpsertMock.mockResolvedValue({ id: "e2e-user-123" });

    const { getCurrentUserIdOrNull } = await import("./current-user");

    await expect(getCurrentUserIdOrNull()).resolves.toBe("e2e-user-123");
    expect(prismaUserUpsertMock).toHaveBeenCalled();
  });

  it("ignores e2e bypass mode in production", async () => {
    vi.stubEnv("E2E_AUTH_BYPASS", "true");
    vi.stubEnv("NODE_ENV", "production");
    getServerSessionMock.mockResolvedValue(null);

    const { getCurrentUserIdOrNull } = await import("./current-user");

    await expect(getCurrentUserIdOrNull()).resolves.toBeNull();
    expect(prismaUserUpsertMock).not.toHaveBeenCalled();
  });
});
