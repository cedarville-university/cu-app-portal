import React from "react";
import { buildCodexHandoffPrompt } from "@/features/repositories/codex-handoff";
import { CodexPreparationChecklist } from "@/features/repositories/codex-preparation-checklist";
import { CopyCodexHandoffButton } from "@/features/repositories/copy-codex-handoff-button";
import type { ImportedAppFeatures } from "./features";

export function ImportServicesHandoff({
  repositoryUrl, appName, requestId, defaultBranch, features, gitAuthor,
}: {
  repositoryUrl: string;
  appName: string;
  requestId: string;
  defaultBranch: string | null;
  features?: ImportedAppFeatures;
  gitAuthor: { githubUsername?: string | null; email?: string | null };
}) {
  const prompt = buildCodexHandoffPrompt(repositoryUrl, appName, requestId, {
    defaultBranch, localFolderMode: "new-or-existing", importFeatures: features, gitAuthor,
  });
  return (
    <section className="info-box" aria-label="Codex handoff">
      <h2>Continue with Codex</h2>
      <p>Use this handoff to connect Codex to your imported app before preparing it for publishing.</p>
      {features ? <p>
        Database: {features.databaseProvider === "postgresql" ? "PostgreSQL" : "No new database"}.
        {" "}Cedarville login: {features.entraLogin ? "Required" : "Not added"}.
      </p> : null}
      {features && (features.databaseProvider === "postgresql" || features.entraLogin) ? <p>
        Before publishing, use this prompt to have Codex connect and test the
        selected services in your app. Publishing setup supplies settings and
        resources; it does not add database tables or protect your app code.
      </p> : null}
      <ol>
        <li>Create or open a local Codex project for the managed copy of this app.</li>
        <li>Copy the handoff below and paste it into a task inside that project.</li>
        <li>After Codex verifies and uploads your changes, return here to continue setup.</li>
      </ol>
      <CopyCodexHandoffButton prompt={prompt} />
      <p>
        Use the managed Cedarville checkout for this task. If you have an
        existing checkout of the original source, keep it and use a new empty
        folder for the managed copy.
      </p>
      <details>
        <summary>Help setting up your Codex project</summary>
        <CodexPreparationChecklist appName={appName} folderKind="new-or-existing" />
      </details>
      <details>
        <summary>Preview the Codex handoff</summary>
        <pre className="wizard-prompt"><code>{prompt}</code></pre>
      </details>
    </section>
  );
}
