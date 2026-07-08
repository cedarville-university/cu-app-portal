import { describe, expect, it, vi } from "vitest";

import { deleteAzureDeployment } from "./external";

const config = {
  resourceGroup: "rg-cu-apps-published",
  postgresServer: "psql-cu-apps-published",
} as never;

function createArm() {
  return {
    deleteWebApp: vi.fn().mockResolvedValue(undefined),
    deletePostgresDatabase: vi.fn().mockResolvedValue(undefined),
    deleteKeyVault: vi.fn().mockResolvedValue(undefined),
  };
}

describe("deleteAzureDeployment", () => {
  it("deletes the key vault when the app has one", async () => {
    const arm = createArm();

    await deleteAzureDeployment(
      {
        resourceGroup: "rg-cu-apps-published",
        webAppName: "app-campus-dashboard-clx9abc1",
        postgresServer: "psql-cu-apps-published",
        databaseName: "db_campus_dashboard_clx9abc1",
        keyVaultName: "kv-campus-dashb-clx9abc1",
      },
      { config, arm },
    );

    expect(arm.deleteKeyVault).toHaveBeenCalledWith({
      resourceGroup: "rg-cu-apps-published",
      name: "kv-campus-dashb-clx9abc1",
    });
  });

  it("skips vault deletion when the app has no vault", async () => {
    const arm = createArm();

    await deleteAzureDeployment(
      {
        resourceGroup: "rg-cu-apps-published",
        webAppName: "app-campus-dashboard-clx9abc1",
        postgresServer: "psql-cu-apps-published",
        databaseName: null,
        keyVaultName: null,
      },
      { config, arm },
    );

    expect(arm.deleteKeyVault).not.toHaveBeenCalled();
  });
});
