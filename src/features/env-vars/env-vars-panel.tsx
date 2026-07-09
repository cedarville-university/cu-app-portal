import React from "react";
import { EnvVarDeleteForm } from "./env-var-delete-form";
import { EnvVarForm } from "./env-var-form";

export type EnvVarListItem = {
  key: string;
  isSecret: boolean;
  value: string | null;
  updatedAt: Date;
};

export function EnvVarsPanel({
  appRequestId,
  envVars,
  isPublished,
}: {
  appRequestId: string;
  envVars: EnvVarListItem[];
  isPublished: boolean;
}) {
  return (
    <section aria-label="Environment variables" className="card">
      <p className="section-title">Environment Variables</p>
      <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
        {isPublished
          ? "Changes apply to your live app within seconds and briefly restart it. Saving an existing name overwrites its value."
          : "Variables you add now are applied when the app is published. Saving an existing name overwrites its value."}{" "}
        Secret values are stored in Azure Key Vault and cannot be viewed again
        after saving.
      </p>
      <EnvVarForm appRequestId={appRequestId} />
      {envVars.length ? (
        <ul
          className="status-table"
          style={{ listStyle: "none", margin: 0, padding: 0 }}
        >
          {envVars.map((envVar) => {
            return (
              <li
                key={envVar.key}
                className="status-row"
                style={{ alignItems: "center", gap: "1rem" }}
              >
                <span
                  style={{
                    display: "grid",
                    gap: "0.25rem",
                    minWidth: 0,
                    overflowWrap: "anywhere",
                  }}
                >
                  <strong style={{ fontFamily: "monospace" }}>
                    {envVar.key}
                  </strong>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {envVar.isSecret ? "••••••••" : envVar.value}
                  </span>
                </span>
                <span
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    justifyContent: "flex-end",
                  }}
                >
                  {envVar.isSecret ? (
                    <span className="badge badge--info">secret</span>
                  ) : null}
                  <EnvVarDeleteForm
                    appRequestId={appRequestId}
                    envKey={envVar.key}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          No environment variables yet.
        </p>
      )}
    </section>
  );
}
