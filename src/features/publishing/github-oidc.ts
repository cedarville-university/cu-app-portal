export type GitHubOidcRepositoryIdentity = {
  owner: string;
  ownerId: string;
  repository: string;
  repositoryId: string;
  useImmutableSubject: boolean;
};

export function buildGitHubFederatedCredentialSubject({
  identity,
  branch,
}: {
  identity: GitHubOidcRepositoryIdentity;
  branch: string;
}) {
  const repository = identity.useImmutableSubject
    ? `${identity.owner}@${identity.ownerId}/${identity.repository}@${identity.repositoryId}`
    : `${identity.owner}/${identity.repository}`;

  return `repo:${repository}:ref:refs/heads/${branch}`;
}
