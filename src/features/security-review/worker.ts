import { execFile } from "node:child_process";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { loadGitHubAppConfig, type GitHubAppConfig } from "@/features/repositories/config";
import { nightlyCycle, scanDueRepositories, type ScanProvider } from "./nightly";

export function workerScanProvider(config: GitHubAppConfig): ScanProvider {
  const root = process.env.CU_SECURITY_SCANNER_DIR || "/opt/cu-security";
  async function readToken(repository: string) {
    const [org, name] = repository.slice("https://github.com/".length).split("/");
    const owner = config.allowedOrgs.find(value => value.toLowerCase() === org);
    const installationId = owner && config.installationIdsByOrg[owner];
    if (!installationId) throw new Error("Unknown managed GitHub organization");
    const client = createGitHubAppClient({ appId: config.appId, privateKey: config.privateKey, installationId,
      fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }) });
    return client.createSourceReadToken(name);
  }
  return {
    async head(repository) {
      const token = await readToken(repository);
      const path = new URL(repository).pathname;
      const response = await fetch(`https://api.github.com/repos${path}/git/ref/heads/main`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(15_000), redirect: "error",
      });
      if (!response.ok) throw new Error("Could not read main");
      return (await response.json()).object.sha;
    },
    async scan(repository, sha) {
      const token = await readToken(repository);
      return new Promise((resolve, reject) => {
        const child = execFile("python3", [join(root, "scan.py"), join(root, "rules"), join(root, "venv/bin/semgrep")], {
          encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "production" }, timeout: 240_000, maxBuffer: 8 * 1024 * 1024,
        }, (err, stdout) => {
          if (err) return reject(new Error("Source scanner did not finish"));
          try { resolve(JSON.parse(stdout)); } catch { reject(new Error("Invalid source scan receipt")); }
        });
        child.stdin?.on("error", reject);
        child.stdin?.end(JSON.stringify({ repository, sha, token }));
      });
    },
  };
}
export async function checkNightlySecurity() {
  const firstCycle = process.env.NIGHTLY_SECURITY_START_AT;
  if (firstCycle) {
    const start = new Date(firstCycle);
    if (!Number.isFinite(start.getTime()) || !firstCycle.endsWith("Z") || nightlyCycle(start).getTime() !== start.getTime()) {
      throw new Error("NIGHTLY_SECURITY_START_AT must be a nightly boundary at 07:00 UTC.");
    }
    if (Date.now() < start.getTime()) return { scanned: 0, unchanged: 0, failed: 0 };
  }
  // A default local portal can run the database publishing worker before GitHub is configured.
  if (process.env.NODE_ENV !== "production" && !process.env.GITHUB_ALLOWED_ORGS) {
    return { scanned: 0, unchanged: 0, failed: 0 };
  }
  const config = loadGitHubAppConfig();
  return scanDueRepositories(prisma, workerScanProvider(config), config.allowedOrgs);
}
