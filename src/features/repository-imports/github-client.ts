import { loadGitHubAppConfig } from "@/features/repositories/config";
import { createGitHubAppClient } from "@/features/repositories/github-app";

export function createImportGitHubClient(owner: string) {
  const config = loadGitHubAppConfig();
  const installationId = Object.entries(config.installationIdsByOrg)
    .find(([org]) => org.toLowerCase() === owner.toLowerCase())?.[1];
  if (!installationId) throw new Error("Managed repository installation is unavailable.");
  return createGitHubAppClient({ appId: config.appId, privateKey: config.privateKey, installationId });
}
