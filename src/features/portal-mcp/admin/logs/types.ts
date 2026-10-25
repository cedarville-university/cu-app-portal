export type LogStatus = "available" | "empty" | "not_configured" | "not_ready" | "not_found" | "forbidden" | "unavailable" | "unsupported";
export type LogEntry = {
  source: "github" | "azure_deployment" | "azure_runtime";
  status: LogStatus;
  message?: string;
  text?: string;
  name?: string;
  runId?: string;
  jobId?: string;
  deploymentId?: string;
  providerStatus?: string;
  conclusion?: string | null;
  url?: string;
  timestamp?: string | null;
  collectedAt?: string;
  correlation?: "uncorrelated";
  lineCount?: number;
  truncated?: boolean;
  snapshot?: string;
};
export type GitHubPosition = {
  page: number;
  index: number;
  offset: number;
  jobId?: string;
};
export type AzurePosition = {
  deployment: {
    id?: string;
    offset: number;
  } | null;
  runtime: {
    offset: number;
  } | null;
};
export type ProviderLogPage<T> = {
  entries: LogEntry[];
  next: T | null;
};
export class LogReadError extends Error {
  constructor(readonly status: LogStatus, message: string) { super(message); this.name = "LogReadError"; }
}
export function sourceFailure(source: LogEntry["source"], error: unknown): LogEntry {
  return {
    source, status: error instanceof LogReadError ? error.status : "unavailable", message: error instanceof LogReadError ? error.message : "The provider logs could not be retrieved."
  };
}
