import { loadGitHubAppConfig } from "../repositories/config";
import { createGitHubAppClient } from "../repositories/github-app";
import { reviewResults } from "./results";

type Registration = { repositoryOwner: string | null; repositoryName: string | null; repositoryUrl: string | null; repositoryStatus: string };

export function enrolledRepository(app: Registration) {
  const { repositoryName: name, repositoryOwner: owner } = app;
  if (app.repositoryStatus !== "READY" || !owner || !name || !/^[a-z\d-]+$/i.test(owner) || !/^[\w.-]+$/.test(name)) return null;
  const fullName = (owner + "/" + name).toLowerCase();
  if (app.repositoryUrl?.toLowerCase() !== "https://github.com/" + fullName) return null;
  const restrictedRepos = process.env.DEPENDABOT_REVIEW_REPOSITORIES;
  if (restrictedRepos !== undefined) {
    const allowed = restrictedRepos.split(",").map(repo => repo.trim().toLowerCase());
    if (!allowed.includes(fullName)) return null;
  }
  return { owner, name };
}

export function updateClient(owner: string, signal?: AbortSignal) {
  const config = loadGitHubAppConfig();
  const org = config.allowedOrgs.find(o => o.toLowerCase() === owner.toLowerCase());
  const installationId = org && config.installationIdsByOrg[org];
  if (!installationId) throw new Error("Repository is outside the managed installation.");
  const fetchImpl: typeof fetch | undefined = signal && ((input, init) =>
    fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
    }));
  return createGitHubAppClient({ appId: config.appId, privateKey: config.privateKey, installationId, fetchImpl });
}

export async function readDependencyReview(repo: { owner: string; name: string }, signal?: AbortSignal) {
  const client = updateClient(repo.owner, signal);
  const [alerts, updates] = await Promise.all([client.readOpenDependabotAlerts(repo), client.readUpdates(repo)]);
  signal?.throwIfAborted();
  return reviewResults.shape.dependency.unwrap().parse({ checkedAt: new Date().toISOString(), alerts, updates });
}
