import React from "react";
import { EnvVarForm } from "./env-var-form";

export type EnvVarListItem = {
  key: string;
  isSecret: boolean;
  value: string | null;
  updatedAt: Date;
};

export function EnvVarsPanel({ appRequestId, envVars, isPublished }: {
  appRequestId: string;
  envVars: EnvVarListItem[];
  isPublished: boolean;
}) {
  return (
    <section aria-label="Environment variables" className="card">
      <p className="section-title">Environment Variables</p>
      <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
        Edit values, add variables, or mark variables for deletion, then select Save Changes. {isPublished
          ? "Saved changes apply to your live app within seconds and briefly restart it."
          : "Saved variables are applied when the app is published."}{" "}
        Secret values are stored in Azure Key Vault and cannot be viewed again after saving.
        Leave a saved secret blank to keep its current value, or enter a replacement.
      </p>
      <EnvVarForm appRequestId={appRequestId} envVars={envVars} />
    </section>
  );
}
