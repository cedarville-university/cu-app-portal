export type McpIdentityRecord = {
  appRequestId: string; endpointUrl: string; tenantId: string;
  applicationObjectId: string | null; applicationClientId: string | null;
  servicePrincipalId: string | null; scopeId: string | null;
  setupStatus: string; failureCode?: string | null; checkedAt: Date | null;
  probeStatus?: string; probeAttemptId?: string | null; probeCommitSha?: string | null; probeCheckedAt?: Date | null;
};
export type McpIdentityLease = {
  record: McpIdentityRecord;
  assertCurrent(): Promise<void>;
  save(patch: Partial<McpIdentityRecord>): Promise<McpIdentityRecord>;
  release(): Promise<void>;
};
export type McpIdentityGraph = {
  ensureApplication(input: { appId: string; endpointUrl: string; applicationObjectId: string | null; scopeId: string | null; authorizeMutation?: () => Promise<void> }): Promise<{ applicationObjectId: string; applicationClientId: string; scopeId: string }>;
  ensureServicePrincipal(applicationClientId: string, authorizeMutation?: () => Promise<void>): Promise<string>;
  isReady(applicationObjectId: string, servicePrincipalId: string, scopeId: string): Promise<boolean>;
};
