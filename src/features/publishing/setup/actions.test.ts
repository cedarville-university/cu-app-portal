import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { repairPublishingSetupAction } from "./actions";
import { repairPublishingSetupForActor } from "./repair-publishing-setup";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    userRole: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("./repair-publishing-setup", () => ({
  repairPublishingSetupForActor: vi.fn(),
}));

describe("publishing setup action adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveCurrentUserId).mockResolvedValue("actor-123");
    vi.mocked(repairPublishingSetupForActor).mockResolvedValue({
      status: "READY",
    });
  });

  it("adapts explicit browser repair to the actor-aware repair service", async () => {
    await repairPublishingSetupAction("request-123");

    expect(repairPublishingSetupForActor).toHaveBeenCalledWith({
      requestId: "request-123",
      actorUserId: "actor-123",
      source: "portal-ui",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith("/download/request-123");
    expect(revalidatePath).toHaveBeenCalledWith("/onboarding/request-123");
  });

  it("does not revalidate when the shared repair service rejects the request", async () => {
    vi.mocked(repairPublishingSetupForActor).mockRejectedValue(
      new Error("App request not found."),
    );

    await expect(repairPublishingSetupAction("request-123")).rejects.toThrow(
      "App request not found.",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
