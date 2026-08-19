import { createHash } from "node:crypto";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import {
  buildDeploymentManifest,
  type DeploymentManifestInput,
} from "@/features/generation/deployment-manifest";
import type { GitHubAppConfig } from "./config";
import { loadGitHubAppConfig } from "./config";
import { createGitHubAppClient } from "./github-app";

type BootstrapManagedRepositoryInput = {
  appRequestId: string;
  input: CreateAppRequestInput;
  files: Record<string, string>;
  reuseExistingRepository?: boolean;
  config?: GitHubAppConfig;
};

export type BootstrapManagedRepositoryResult = {
  provider: "GITHUB";
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  visibility: "private" | "internal" | "public";
};

function resolveInstallationId(config: GitHubAppConfig, owner: string) {
  const installationId = config.installationIdsByOrg[owner];

  if (!installationId) {
    throw new Error(`No GitHub App installation is configured for org "${owner}".`);
  }

  return installationId;
}

const GITHUB_REPOSITORY_NAME_LIMIT = 100;
const REQUEST_SEGMENT_LIMIT = 40;
export const MANAGED_REPOSITORY_OWNERSHIP_PATH =
  "app-portal/managed-request.json";

function requestNameSegment(appRequestId: string) {
  const normalized = appRequestId
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  if (!normalized) {
    throw new Error("App request id cannot produce a managed repository name.");
  }

  if (normalized.length <= REQUEST_SEGMENT_LIMIT) {
    return normalized;
  }

  const digest = createHash("sha256")
    .update(appRequestId)
    .digest("hex")
    .slice(0, 16);
  const prefixLength = REQUEST_SEGMENT_LIMIT - digest.length - 1;

  return `${normalized.slice(0, prefixLength)}-${digest}`;
}

export function buildManagedRepositoryName(
  baseName: string,
  appRequestId: string,
) {
  const requestSegment = requestNameSegment(appRequestId);
  const availableBaseLength =
    GITHUB_REPOSITORY_NAME_LIMIT - requestSegment.length - 1;
  const boundedBase = baseName
    .slice(0, availableBaseLength)
    .replaceAll(/-+$/g, "");

  return `${boundedBase || "app"}-${requestSegment}`;
}

export function buildManagedRepositoryOwnership(appRequestId: string) {
  return {
    description: `Cedarville App Portal request:${appRequestId}`,
    path: MANAGED_REPOSITORY_OWNERSHIP_PATH,
    content: `${JSON.stringify(
      {
        schemaVersion: "1.0.0",
        appRequestId,
      },
      null,
      2,
    )}\n`,
  };
}

export async function bootstrapManagedRepository({
  appRequestId,
  input,
  files,
  reuseExistingRepository = false,
  config = loadGitHubAppConfig(),
}: BootstrapManagedRepositoryInput): Promise<BootstrapManagedRepositoryResult> {
  const owner = config.defaultOrg;

  if (!config.allowedOrgs.includes(owner)) {
    throw new Error(`Configured GitHub org "${owner}" is not allowed.`);
  }

  if (input.hostingTarget !== "Azure App Service") {
    throw new Error(
      `Managed repository bootstrap currently supports Azure App Service only, received "${input.hostingTarget}".`,
    );
  }

  const manifest = buildDeploymentManifest(input as DeploymentManifestInput);
  const repositoryName = buildManagedRepositoryName(
    manifest.defaults.githubRepository,
    appRequestId,
  );
  const client = createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: resolveInstallationId(config, owner),
  });

  const repository = await client.createRepository({
    owner,
    name: repositoryName,
    visibility: config.defaultRepoVisibility,
    files,
    defaultBranch: "main",
    ownershipMarker: buildManagedRepositoryOwnership(appRequestId),
    ...(reuseExistingRepository ? { reuseIfAlreadyExists: true } : {}),
  });

  return {
    provider: "GITHUB",
    owner: repository.owner,
    name: repository.name,
    url: repository.url,
    defaultBranch: repository.defaultBranch,
    visibility: config.defaultRepoVisibility,
  };
}
