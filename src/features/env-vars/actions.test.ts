import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));
vi.mock("@/features/app-requests/access", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/app-requests/access")
  >()),
  userHasAdminRole: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("./service", () => ({
  createDefaultEnvVarServiceDeps: vi.fn().mockReturnValue({ deps: true }),
  saveEnvironmentVariable: vi.fn(),
  deleteEnvironmentVariable: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { userHasAdminRole } from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { deleteEnvVarAction, saveEnvVarFormAction } from "./actions";
import {
  deleteEnvironmentVariable,
  saveEnvironmentVariable,
} from "./service";

const accessibleAppRequest = {
  id: "req-1",
  appName: "Campus Dashboard",
  azureWebAppName: null,
  azureKeyVaultName: null,
  azureKeyVaultUri: null,
};

function formDataOf(entries: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }

  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveCurrentUserId).mockResolvedValue("user-1");
  vi.mocked(userHasAdminRole).mockResolvedValue(false);
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
    accessibleAppRequest as never,
  );
});

describe("saveEnvVarFormAction", () => {
  it("saves the variable, audits, and revalidates", async () => {
    const state = await saveEnvVarFormAction(
      "req-1",
      { error: null, savedKey: null },
      formDataOf({ key: "API_KEY", value: "s3cret", isSecret: "true" }),
    );

    expect(saveEnvironmentVariable).toHaveBeenCalledWith(
      { deps: true },
      {
        appRequest: accessibleAppRequest,
        key: "API_KEY",
        value: "s3cret",
        isSecret: true,
      },
    );
    expect(recordAuditEvent).toHaveBeenCalledWith("ENV_VAR_SET", {
      requestId: "req-1",
      key: "API_KEY",
      isSecret: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/download/req-1");
    expect(state).toEqual({ error: null, savedKey: "API_KEY" });
  });

  it("never passes the secret value to the audit log", async () => {
    await saveEnvVarFormAction(
      "req-1",
      { error: null, savedKey: null },
      formDataOf({ key: "API_KEY", value: "s3cret", isSecret: "true" }),
    );

    const details = vi.mocked(recordAuditEvent).mock.calls[0][1];

    expect(JSON.stringify(details)).not.toContain("s3cret");
  });

  it("returns an inaccessible-app error without calling the service", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

    const state = await saveEnvVarFormAction(
      "req-1",
      { error: null, savedKey: null },
      formDataOf({ key: "API_KEY", value: "x" }),
    );

    expect(state.error).toBe("App request not found.");
    expect(saveEnvironmentVariable).not.toHaveBeenCalled();
  });

  it("surfaces service errors as form state", async () => {
    vi.mocked(saveEnvironmentVariable).mockRejectedValue(
      new Error('"DATABASE_URL" is reserved and managed by the portal.'),
    );

    const state = await saveEnvVarFormAction(
      "req-1",
      { error: null, savedKey: null },
      formDataOf({ key: "DATABASE_URL", value: "x" }),
    );

    expect(state.error).toContain("reserved");
    expect(state.savedKey).toBeNull();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("deleteEnvVarAction", () => {
  it("deletes, audits, and revalidates", async () => {
    await deleteEnvVarAction("req-1", "API_KEY");

    expect(deleteEnvironmentVariable).toHaveBeenCalledWith(
      { deps: true },
      { appRequest: accessibleAppRequest, key: "API_KEY" },
    );
    expect(recordAuditEvent).toHaveBeenCalledWith("ENV_VAR_DELETED", {
      requestId: "req-1",
      key: "API_KEY",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/download/req-1");
  });

  it("throws when the app is not accessible", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

    await expect(deleteEnvVarAction("req-1", "API_KEY")).rejects.toThrow(
      "App request not found.",
    );
    expect(deleteEnvironmentVariable).not.toHaveBeenCalled();
  });
});
