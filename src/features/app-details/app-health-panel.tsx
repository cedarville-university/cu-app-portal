import React from "react";
import { checkAppHealthAction } from "@/features/publishing/health-actions";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";

export function AppHealthPanel({ app }: { app: {
  id: string;
  azureWebAppName?: string | null;
  publishStatus: string;
  healthStatus?: string;
  healthCheckedAt?: Date | null;
  healthSummary?: string | null;
} }) {
  if (!app.azureWebAppName || !["FAILED", "SUCCEEDED"].includes(app.publishStatus)) return null;
  const labels: Record<string, string> = { HEALTHY: "Healthy", WARNING: "Available with a warning", UNHEALTHY: "Unhealthy", NOT_CHECKED: "Not checked yet" };
  const healthy = app.healthStatus === "HEALTHY";
  const variant = healthy ? "success" : app.healthStatus === "UNHEALTHY" ? "error" : "warning";
  return (
    <section aria-label="App health" className="card">
      <h2 className="section-title">App Health</h2>
      <p><span className={`badge badge--${variant}`}>{labels[app.healthStatus ?? "NOT_CHECKED"] ?? "Not checked yet"}</span></p>
      {app.healthCheckedAt ? <p>Last checked: <time dateTime={app.healthCheckedAt.toISOString()}>{app.healthCheckedAt.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} Eastern</time></p> : null}
      {app.healthSummary ? <p role="status">{app.healthSummary}</p> : null}
      <p>{healthy ? "CU Launch checks healthy apps automatically every two hours." : "CU Launch checks apps awaiting a healthy result automatically every five minutes."}</p>
      <form action={checkAppHealthAction.bind(null, app.id)}>
        <PendingSubmitButton idleLabel="Check Health" pendingLabel="Checking Health…" statusText="Checking your app and its recorded deployment status. This can take a moment." variant="secondary" title="Checks the running app without starting a deployment" />
      </form>
      <p>Checks the running app without starting a deployment. A verified successful GitHub deployment and a healthy app can update a failed publishing status.</p>
    </section>
  );
}
