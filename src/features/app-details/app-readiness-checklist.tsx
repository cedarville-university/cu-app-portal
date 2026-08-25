import React from "react";

type AppAudience = "cedarville" | "public" | "not-recorded";

export function AppReadinessChecklist({
  repositoryReady,
  publishingReady,
  publishStatus,
  audience,
}: {
  repositoryReady: boolean;
  publishingReady: boolean;
  publishStatus: string;
  audience: AppAudience;
}) {
  const publishingMessage =
    publishStatus === "SUCCEEDED"
      ? "Your app is online."
      : publishingReady
        ? "Your app is ready to publish."
        : "Publishing still needs to be set up.";

  const audienceMessage =
    audience === "cedarville"
      ? "Cedarville sign-in is required."
      : audience === "public"
        ? "This app is openly public: anyone who knows or discovers its address can use it."
        : "The app audience was not recorded for this earlier app.";

  return (
    <section aria-label="App readiness" className="card">
      <h2 className="section-title">App readiness</h2>
      <ul className="checklist" style={{ marginBottom: 0 }}>
        <li>
          {repositoryReady
            ? "Your private code home is ready."
            : "Your private code home is still being prepared."}
        </li>
        <li>{audienceMessage}</li>
        <li>{publishingMessage}</li>
      </ul>
    </section>
  );
}
