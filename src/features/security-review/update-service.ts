import { loadGitHubAppConfig } from "../repositories/config";
import { createGitHubAppClient } from "../repositories/github-app";
import { reviewResults } from "./results";

type Registration = { repositoryOwner: string | null; repositoryName: string | null; repositoryUrl: string | null; repositoryStatus: string };

export function enrolledRepository(app: Registration) {
  const { repositoryName: name, repositoryOwner: owner } = app;
  if (app.repositoryStatus !== "READY" || !owner || !name || !/^[a-z\d-]+$/i.test(owner) || !/^[\w.-]+$/.test(name)) return null;
  const fullName = (owner + "/" + name).toLowerCase();
  const enrolled = (process.env.DEPENDABOT_REVIEW_REPOSITORIES ?? "cu-app-portal-repos/testing-bouncer")
    .split(",").map(s => s.trim().toLowerCase());
  if (!enrolled.includes(fullName) || app.repositoryUrl?.toLowerCase() !== "https://github.com/" + fullName) return null;
  return { owner, name };
}

export function updateClient(owner: string) {
  const config = loadGitHubAppConfig();
  const org = config.allowedOrgs.find(o => o.toLowerCase() === owner.toLowerCase());
  const installationId = org && config.installationIdsByOrg[org];
  if (!installationId) throw new Error("Repository is outside the managed installation.");
  return createGitHubAppClient({ appId: config.appId, privateKey: config.privateKey, installationId });
}

export async function readDependencyReview(repo: { owner: string; name: string }) {
  const client = updateClient(repo.owner);
  const [alerts, updates] = await Promise.all([client.readOpenDependabotAlerts(repo), client.readUpdates(repo)]);
  return reviewResults.shape.dependency.unwrap().parse({ checkedAt: new Date().toISOString(), alerts, updates });
}
