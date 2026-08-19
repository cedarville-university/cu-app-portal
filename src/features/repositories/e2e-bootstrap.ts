import { isE2EAuthBypassEnabled } from "@/auth/e2e-bypass";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import {
  buildDeploymentManifest,
  type DeploymentManifestInput,
} from "@/features/generation/deployment-manifest";
import {
  buildManagedRepositoryName,
  type BootstrapManagedRepositoryResult,
} from "./bootstrap-managed-repository";

export function getE2EManagedRepositoryBootstrap({
  appRequestId,
  input,
}: {
  appRequestId: string;
  input: CreateAppRequestInput;
}): BootstrapManagedRepositoryResult | null {
  if (!isE2EAuthBypassEnabled()) {
    return null;
  }

  const manifest = buildDeploymentManifest(input as DeploymentManifestInput);
  const owner = "cedarville-e2e";
  const name = buildManagedRepositoryName(
    manifest.defaults.githubRepository,
    appRequestId,
  );

  return {
    provider: "GITHUB",
    owner,
    name,
    url: `https://github.invalid/${owner}/${name}`,
    defaultBranch: "main",
    visibility: "private",
  };
}
