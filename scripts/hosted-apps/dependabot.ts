import { readDependencyReview, enrolledRepository } from "../../src/features/security-review/update-service";
import { createGitHubAppClient } from "../../src/features/repositories/github-app";
import { loadGitHubAppConfig } from "../../src/features/repositories/config";

async function main() {
  const [action, repository, ...extra] = process.argv.slice(2);
  if (!["enable", "read"].includes(action) || !/^[\w-]+\/[\w.-]+$/.test(repository ?? "") || extra.length) {
    throw new Error("Usage: dependabot.ts <enable|read> <managed-org/repository>");
  }
  const [owner, name] = repository.split("/");
  const config = loadGitHubAppConfig();
  const installationId = config.installationIdsByOrg[owner];
  if (!config.allowedOrgs.includes(owner) || !installationId) throw new Error("Unknown managed organization.");
  const client = createGitHubAppClient({ appId: config.appId, privateKey: config.privateKey, installationId });
  if (action === "enable") {
    await client.enableDependabotAlerts({ owner, name });
    console.log(JSON.stringify({ repository, enabled: true }));
  } else {
    const pilot = enrolledRepository({ repositoryStatus: "READY", repositoryOwner: owner, repositoryName: name, repositoryUrl: "https://github.com/" + repository });
    const receipt = pilot ? await readDependencyReview(pilot) : { alerts: await client.readOpenDependabotAlerts({ owner, name }), checkedAt: new Date().toISOString() };
    console.log(JSON.stringify({ repository, reader: "cu-launch-installation", ...receipt }));
  }
}

main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
